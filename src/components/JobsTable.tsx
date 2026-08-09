"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import {
  deleteExistingJob,
  getAddressSuggestions,
  getDayRouteInfo,
  getManualOrderImpact,
  getSchedulingSuggestion,
  saveManualOrder,
  updateExistingJob,
  type SuggestionResult,
} from "@/app/actions";
import { DaySuggestionPanel, type TimeSelection } from "@/components/DaySuggestionPanel";
import { DragHandleIcon, PinIcon } from "@/components/icons";
import { formatDayHeading, formatDistance, type DistanceUnit } from "@/lib/format";
import type { AddressSuggestion } from "@/lib/geocoding";
import type { JobRecord } from "@/lib/jobs";
import {
  ASSUMED_JOB_DURATION_MINUTES,
  type DayRoute,
  type ManualOrderComparison,
  type TimeSlotType,
} from "@/lib/scheduling";

const TIME_SLOT_OPTIONS: { value: TimeSlotType; label: string }[] = [
  { value: "none", label: "Flexible" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "specific", label: "Specific" },
];

function timeSlotLabel(type: TimeSlotType): string {
  return TIME_SLOT_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function jobTimeLabel(job: JobRecord): string {
  return job.time_slot_type === "specific"
    ? job.specific_time ?? ""
    : timeSlotLabel(job.time_slot_type as TimeSlotType);
}

/** The section a stop displays under — every type except "specific", which
 *  has its own real time rather than sharing a time-of-day zone with
 *  siblings. */
function sectionOf(job: JobRecord): TimeSlotType | null {
  const type = job.time_slot_type as TimeSlotType;
  return type === "specific" ? null : type;
}

/** One day's jobs in the order they should actually be driven. Distances
 *  are null when no home address is set, since there's no anchor to route
 *  from — the jobs are still listed, just without an order or legs. */
export interface DayPlan {
  date: string;
  stops: {
    job: JobRecord;
    distanceFromPreviousKm: number | null;
    cumulativeDistanceKm: number | null;
  }[];
  returnHomeKm: number | null;
  totalDistanceKm: number | null;
}

function formatDistanceForUnit(distanceKm: number | null, unit: DistanceUnit): string {
  return formatDistance(distanceKm, unit);
}

/** Draggable + droppable section header — the target for a cross-section
 *  drop (Part B). Not draggable itself, just a landing zone. */
function SectionDropZone({ label, section, date }: { label: string; section: TimeSlotType; date: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section:${date}:${section}`,
    data: { type: "section", section },
  });

  return (
    <div
      ref={setNodeRef}
      className={`timeline-section-header${isOver ? " is-drop-target" : ""}`}
    >
      {label}
    </div>
  );
}

/**
 * A read-only stop row, draggable and droppable when it belongs to a
 * section (specific-time stops opt out of both — their position is a real
 * time, not something to drag). Dropping one stop onto another within the
 * same section reorders them (Part E); dropping onto a different section's
 * header changes the job's time slot (Part B) — disambiguated in the
 * shared onDragEnd handler, not here.
 */
function TimelineStop({
  job,
  stopNumber,
  distanceFromPreviousKm,
  distanceUnit,
  onTap,
}: {
  job: JobRecord;
  stopNumber: number;
  distanceFromPreviousKm: number | null;
  distanceUnit: DistanceUnit;
  onTap: () => void;
}) {
  const section = sectionOf(job);
  const isCompleted = job.status === "completed";
  const isDraggable = section !== null;

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { section },
    disabled: !isDraggable,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: job.id,
    data: { type: "stop", section },
    disabled: !isDraggable,
  });

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
              zIndex: isDragging ? 10 : undefined,
              opacity: isDragging ? 0.6 : undefined,
              position: "relative",
            }
          : undefined
      }
      className={`stop is-tappable${isCompleted ? " is-done" : ""}${
        isOver ? " is-drop-target" : ""
      }`}
      onClick={onTap}
    >
      <span className="stop-dot">{isCompleted ? "✓" : stopNumber}</span>
      <div className="stop-body">
        <div className="stop-time">{jobTimeLabel(job)}</div>
        <div className="stop-name">{job.customer_name}</div>
        <div className="stop-address">{job.address}</div>
      </div>
      <div className="stop-leg">{formatDistanceForUnit(distanceFromPreviousKm, distanceUnit)}</div>
      {isDraggable && (
        <button
          type="button"
          className="stop-drag-handle"
          aria-label="Drag to reorder or change time of day"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <DragHandleIcon />
        </button>
      )}
    </div>
  );
}

interface EditValues {
  address: string;
  date: string;
  timeSlotType: TimeSlotType;
  specificTime: string;
  customerName: string;
  description: string;
  /** Blank means "use the flat default" — parsed to a number at save. */
  durationMinutesInput: string;
}

interface ReorderWarning {
  date: string;
  proposedOrder: string[];
  impact: ManualOrderComparison;
}

export function JobsTable({
  days,
  distanceUnit,
}: {
  days: DayPlan[];
  distanceUnit: DistanceUnit;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  // First day open, the rest collapsed — the design's mixed state.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(days.slice(1).map((day) => day.date))
  );

  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set only when the address or time was changed and we're asking which
  // day/time to use.
  const [daySuggestion, setDaySuggestion] = useState<SuggestionResult | null>(null);
  // The job's current date, fetched on demand only if it isn't already
  // among the ranked candidates.
  const [currentDateOnDemandInfo, setCurrentDateOnDemandInfo] = useState<DayRoute | null>(
    null
  );

  // Set only once a within-section reorder turns out to cost meaningfully
  // more than the computed order — the drag has already happened, this
  // just gates whether it's actually kept.
  const [reorderWarning, setReorderWarning] = useState<ReorderWarning | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const [isSaving, startSaving] = useTransition();
  const [isCheckingDay, startCheckingDay] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [isCheckingReorder, startCheckingReorder] = useTransition();
  const [isSavingReorder, startSavingReorder] = useTransition();

  function toggleDay(date: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  function startEditing(job: JobRecord) {
    setEditingId(job.id);
    setEditValues({
      address: job.address,
      date: job.date,
      timeSlotType: job.time_slot_type as TimeSlotType,
      specificTime: job.specific_time ?? "",
      customerName: job.customer_name,
      description: job.description ?? "",
      durationMinutesInput: job.duration_minutes?.toString() ?? "",
    });
    setError(null);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setDaySuggestion(null);
    setCurrentDateOnDemandInfo(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditValues(null);
    setError(null);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
    setDaySuggestion(null);
    setCurrentDateOnDemandInfo(null);
  }

  function handleAddressChange(value: string) {
    if (!editValues) return;
    setEditValues({ ...editValues, address: value });
    setShowAddressSuggestions(true);

    if (addressDebounceRef.current) {
      clearTimeout(addressDebounceRef.current);
    }

    if (value.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }

    addressDebounceRef.current = setTimeout(() => {
      getAddressSuggestions(value)
        .then(setAddressSuggestions)
        .catch(() => setAddressSuggestions([]));
    }, 300);
  }

  function handleSelectAddressSuggestion(suggestion: AddressSuggestion) {
    if (!editValues) return;
    setEditValues({ ...editValues, address: suggestion.placeName });
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }

  function doSave(job: JobRecord, date: string, time: TimeSelection) {
    if (!editValues) return;
    setError(null);

    startSaving(async () => {
      try {
        await updateExistingJob({
          id: job.id,
          address: editValues.address,
          date,
          timeSlotType: time.type,
          specificTime: time.specificTime,
          customerName: editValues.customerName,
          description: editValues.description,
          durationMinutes: editValues.durationMinutesInput.trim()
            ? Number(editValues.durationMinutesInput)
            : null,
        });
        setEditingId(null);
        setEditValues(null);
        setDaySuggestion(null);
        setCurrentDateOnDemandInfo(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save changes.");
      }
    });
  }

  function handleSaveClick(job: JobRecord) {
    if (!editValues) return;

    const addressChanged = editValues.address.trim() !== job.address.trim();
    const timeChanged =
      editValues.timeSlotType !== job.time_slot_type ||
      (editValues.timeSlotType === "specific" &&
        editValues.specificTime !== (job.specific_time ?? ""));
    const durationChanged =
      editValues.durationMinutesInput.trim() !== (job.duration_minutes?.toString() ?? "");

    if (!addressChanged && !timeChanged && !durationChanged) {
      doSave(job, editValues.date, {
        type: editValues.timeSlotType,
        specificTime:
          editValues.timeSlotType === "specific" ? editValues.specificTime : null,
      });
      return;
    }

    const durationMinutes = editValues.durationMinutesInput.trim()
      ? Number(editValues.durationMinutesInput)
      : null;

    // Address, time, or duration changed — check whether the current day is
    // still the best choice before saving, rather than silently keeping a
    // now-stale day/time combination.
    setError(null);
    startCheckingDay(async () => {
      try {
        const result = await getSchedulingSuggestion(
          editValues.address,
          {
            type: editValues.timeSlotType,
            specificTime:
              editValues.timeSlotType === "specific" ? editValues.specificTime : undefined,
          },
          job.id,
          durationMinutes
        );
        setDaySuggestion(result);

        // The current date might not be among the ranked candidates. Fetch
        // its real info on demand so "keep the current date" never shows
        // blank or broken detail.
        if (result.allDays.some((d) => d.date === editValues.date)) {
          setCurrentDateOnDemandInfo(null);
        } else {
          try {
            const info = await getDayRouteInfo(
              result.coordinates,
              {
                type: editValues.timeSlotType,
                specificTime:
                  editValues.timeSlotType === "specific"
                    ? editValues.specificTime
                    : undefined,
              },
              editValues.date,
              job.id,
              durationMinutes
            );
            setCurrentDateOnDemandInfo(info);
          } catch {
            setCurrentDateOnDemandInfo(null);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleDelete(job: JobRecord) {
    if (!confirm(`Delete the job for ${job.customer_name}?`)) {
      return;
    }
    setError(null);

    startDeleting(async () => {
      try {
        await deleteExistingJob(job.id);
        cancelEditing();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete job.");
      }
    });
  }

  /**
   * Dragging a job into a different time-of-day section — functionally the
   * same as opening it, picking a new time-slot chip, and letting the
   * existing day-suitability recheck run, just via drag instead. Reuses
   * that exact machinery rather than a parallel path: this drops straight
   * into the same "editing + daySuggestion" state handleSaveClick already
   * knows how to render and confirm, so the drag path gets the same
   * feasibility/distance warnings the manual edit path already has.
   */
  function handleSectionDrop(job: JobRecord, targetSection: TimeSlotType) {
    setError(null);
    setEditingId(job.id);
    setEditValues({
      address: job.address,
      date: job.date,
      timeSlotType: targetSection,
      specificTime: "",
      customerName: job.customer_name,
      description: job.description ?? "",
      durationMinutesInput: job.duration_minutes?.toString() ?? "",
    });
    setDaySuggestion(null);
    setCurrentDateOnDemandInfo(null);

    startCheckingDay(async () => {
      try {
        const result = await getSchedulingSuggestion(
          job.address,
          { type: targetSection, specificTime: undefined },
          job.id,
          job.duration_minutes
        );
        setDaySuggestion(result);

        if (!result.allDays.some((d) => d.date === job.date)) {
          try {
            const info = await getDayRouteInfo(
              result.coordinates,
              { type: targetSection, specificTime: undefined },
              job.date,
              job.id,
              job.duration_minutes
            );
            setCurrentDateOnDemandInfo(info);
          } catch {
            setCurrentDateOnDemandInfo(null);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  /**
   * Dragging to reorder within the same section — a manual override of the
   * computed route order. Checks the real cost first: under
   * MEANINGFUL_REORDER_DELTA_KM, it just saves; over it, holds off and
   * shows the honest delta before committing, the same way the existing
   * distance warnings gate a save rather than silently accepting or
   * blocking a worse order outright.
   */
  function handleWithinSectionReorder(date: string, proposedOrder: string[]) {
    setReorderError(null);
    startCheckingReorder(async () => {
      try {
        const impact = await getManualOrderImpact(date, proposedOrder);
        if (impact.meaningful) {
          setReorderWarning({ date, proposedOrder, impact });
          return;
        }
        await saveManualOrder(proposedOrder);
        router.refresh();
      } catch (err) {
        setReorderError(
          err instanceof Error ? err.message : "Could not check that reorder."
        );
      }
    });
  }

  function confirmReorderWarning() {
    if (!reorderWarning) return;
    const { proposedOrder } = reorderWarning;
    setReorderWarning(null);
    startSavingReorder(async () => {
      try {
        await saveManualOrder(proposedOrder);
        router.refresh();
      } catch (err) {
        setReorderError(err instanceof Error ? err.message : "Failed to save the new order.");
      }
    });
  }

  function handleDragEnd(day: DayPlan, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as { section: TimeSlotType | null } | undefined;
    const overData = over.data.current as
      | { type: "stop" | "section"; section: TimeSlotType }
      | undefined;
    if (!activeData || activeData.section === null || !overData) return;

    const draggedJob = day.stops.find((s) => s.job.id === active.id)?.job;
    if (!draggedJob) return;

    if (overData.section !== activeData.section) {
      handleSectionDrop(draggedJob, overData.section);
      return;
    }

    if (overData.type !== "stop") return;

    const groupJobIds = day.stops
      .filter((s) => sectionOf(s.job) === activeData.section)
      .map((s) => s.job.id);
    const oldIndex = groupJobIds.indexOf(active.id as string);
    const newIndex = groupJobIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...groupJobIds];
    reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, active.id as string);
    handleWithinSectionReorder(day.date, reordered);
  }

  const totalStops = days.reduce((count, day) => count + day.stops.length, 0);
  if (totalStops === 0) {
    return (
      <p className="empty">
        No jobs booked this week yet.
        <br />
        Tap + to add your first one.
      </p>
    );
  }

  return (
    <div>
      {error && <p className="error-text">{error}</p>}
      {reorderError && <p className="error-text">{reorderError}</p>}
      {isCheckingReorder && <p className="note">Checking that order...</p>}

      {reorderWarning && (
        <div className="warn-block">
          <p>
            This order adds ~{formatDistanceForUnit(reorderWarning.impact.deltaKm, distanceUnit)} more than the most
            efficient arrangement ({formatDistanceForUnit(reorderWarning.impact.algorithmicKm, distanceUnit)} vs{" "}
            {formatDistanceForUnit(reorderWarning.impact.manualKm, distanceUnit)}).
          </p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn--warning"
              onClick={confirmReorderWarning}
              disabled={isSavingReorder}
            >
              {isSavingReorder ? "Saving..." : "Keep this order"}
            </button>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setReorderWarning(null)}
              disabled={isSavingReorder}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {days.map((day) => {
        const isOpen = !collapsed.has(day.date);
        const allCompleted =
          day.stops.length > 0 &&
          day.stops.every((stop) => stop.job.status === "completed");

        return (
          <div className="card" key={day.date}>
            <div className={`day-card-head${allCompleted ? " is-complete" : ""}`}>
              <div>
                <span className="day-title">{formatDayHeading(day.date)}</span>{" "}
                <span className="day-stops">
                  {day.stops.length} stop{day.stops.length === 1 ? "" : "s"}
                </span>
                {allCompleted && <span className="badge badge--success">✓ All done</span>}
              </div>
              <button
                type="button"
                className="btn--quiet"
                onClick={() => toggleDay(day.date)}
              >
                {isOpen ? "Hide details" : "See details"}
              </button>
            </div>
            {day.totalDistanceKm !== null && (
              <div className="day-distance">
                {formatDistanceForUnit(day.totalDistanceKm, distanceUnit)} round trip
              </div>
            )}

            {isOpen && (
              <DndContext onDragEnd={(event) => handleDragEnd(day, event)}>
              <div className="timeline">
                <div className="stop">
                  <span className="stop-dot stop-dot--endpoint" />
                  <div className="stop-body">
                    <div className="stop-endpoint-label">Start</div>
                    <div className="stop-name">Home</div>
                  </div>
                </div>

                {(() => {
                  // Mutated across iterations to spot a section change —
                  // scoped to this one day's render, reset every time this
                  // day's card re-renders.
                  let previousSection: TimeSlotType | null = null;

                  return day.stops.map((stop, stopIndex) => {
                    const job = stop.job;
                    const stopNumber = stopIndex + 1;

                    const section = sectionOf(job);
                    // Shows again after any interruption (a specific-time
                    // stop, or a different section) rather than only once
                    // per day — a repeated "Morning" header after a
                    // specific-time job is more honest about the real
                    // driving order than hiding where it resumes.
                    const showHeader = section !== null && section !== previousSection;
                    previousSection = section;
                    const header = showHeader ? (
                      <SectionDropZone
                        key={`section-${job.id}`}
                        label={timeSlotLabel(section)}
                        section={section}
                        date={day.date}
                      />
                    ) : null;

                  if (editingId === job.id && editValues && daySuggestion) {
                    return [
                      header,
                      <div className="stop" key={job.id}>
                        <span className="stop-dot">{stopNumber}</span>
                        <div className="stop-body">
                          <DaySuggestionPanel
                            suggestion={daySuggestion}
                            jobId={job.id}
                            distanceUnit={distanceUnit}
                            requestedTime={{
                              type: editValues.timeSlotType,
                              specificTime: editValues.specificTime,
                            }}
                            durationMinutes={
                              editValues.durationMinutesInput.trim()
                                ? Number(editValues.durationMinutesInput)
                                : null
                            }
                            currentDate={editValues.date}
                            currentDateInfo={currentDateOnDemandInfo}
                            requestedTimeLabel={
                              editValues.timeSlotType === "specific" &&
                              editValues.specificTime
                                ? editValues.specificTime
                                : timeSlotLabel(editValues.timeSlotType)
                            }
                            isSaving={isSaving}
                            onConfirm={(date, time) => doSave(job, date, time)}
                          />
                          <div className="btn-row" style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              className="btn btn--outline btn--sm"
                              onClick={() => setDaySuggestion(null)}
                              disabled={isSaving}
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              className="btn btn--outline btn--sm"
                              onClick={cancelEditing}
                              disabled={isSaving}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>,
                    ];
                  }

                  if (editingId === job.id && editValues) {
                    return [
                      header,
                      <div className="stop" key={job.id}>
                        <span className="stop-dot">{stopNumber}</span>
                        <div className="stop-body">
                          <div className="field">
                            <label className="field-label">Customer</label>
                            <input
                              className="input"
                              value={editValues.customerName}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  customerName: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="field">
                            <label className="field-label">Address</label>
                            <input
                              className="input"
                              value={editValues.address}
                              onChange={(e) => handleAddressChange(e.target.value)}
                              onFocus={() => setShowAddressSuggestions(true)}
                              onBlur={() =>
                                setTimeout(() => setShowAddressSuggestions(false), 150)
                              }
                              autoComplete="off"
                            />
                            {showAddressSuggestions && addressSuggestions.length > 0 && (
                              <ul className="autocomplete">
                                {addressSuggestions.map((s) => (
                                  <li key={s.id}>
                                    <button
                                      type="button"
                                      className="autocomplete-item"
                                      onClick={() => handleSelectAddressSuggestion(s)}
                                    >
                                      <PinIcon />
                                      {s.placeName}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div className="field">
                            <label className="field-label">Description</label>
                            <input
                              className="input"
                              value={editValues.description}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  description: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="field">
                            <label className="field-label">Duration (minutes)</label>
                            <input
                              className="input"
                              type="number"
                              min={1}
                              step="1"
                              placeholder={`Defaults to ${ASSUMED_JOB_DURATION_MINUTES} min`}
                              value={editValues.durationMinutesInput}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  durationMinutesInput: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="field">
                            <label className="field-label">Date</label>
                            <input
                              className="input"
                              type="date"
                              placeholder="Select a date"
                              value={editValues.date}
                              onChange={(e) =>
                                setEditValues({ ...editValues, date: e.target.value })
                              }
                            />
                          </div>

                          <div className="field">
                            <label className="field-label">Time</label>
                            <div className="chips">
                              {TIME_SLOT_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={`chip${
                                    editValues.timeSlotType === option.value
                                      ? " is-selected"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    setEditValues({
                                      ...editValues,
                                      timeSlotType: option.value,
                                    })
                                  }
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            {editValues.timeSlotType === "specific" && (
                              <input
                                className="input input--time"
                                style={{ marginTop: 8 }}
                                type="time"
                                placeholder="Select a time"
                                value={editValues.specificTime}
                                onChange={(e) =>
                                  setEditValues({
                                    ...editValues,
                                    specificTime: e.target.value,
                                  })
                                }
                              />
                            )}
                          </div>

                          <div className="btn-row">
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              onClick={() => handleSaveClick(job)}
                              disabled={isSaving || isCheckingDay}
                            >
                              {isCheckingDay
                                ? "Checking..."
                                : isSaving
                                  ? "Saving..."
                                  : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn--outline btn--sm"
                              onClick={cancelEditing}
                              disabled={isSaving || isCheckingDay}
                            >
                              Cancel
                            </button>
                          </div>
                          <button
                            type="button"
                            className="btn--quiet"
                            style={{ marginTop: 10, color: "var(--warning)" }}
                            onClick={() => handleDelete(job)}
                            disabled={isDeleting}
                          >
                            Delete this job
                          </button>
                        </div>
                      </div>,
                    ];
                  }

                  return [
                    header,
                    <TimelineStop
                      key={job.id}
                      job={job}
                      stopNumber={stopNumber}
                      distanceFromPreviousKm={stop.distanceFromPreviousKm}
                      distanceUnit={distanceUnit}
                      onTap={() => startEditing(job)}
                    />,
                  ];
                  });
                })()}

                <div className="stop">
                  <span className="stop-dot stop-dot--endpoint" />
                  <div className="stop-body">
                    <div className="stop-endpoint-label">End</div>
                    <div className="stop-name">Home</div>
                  </div>
                  <div className="stop-leg">{formatDistanceForUnit(day.returnHomeKm, distanceUnit)}</div>
                </div>
              </div>
              </DndContext>
            )}
          </div>
        );
      })}
    </div>
  );
}
