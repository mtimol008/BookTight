"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  getSchedulingSuggestion,
  markJobCancelled,
  markJobsCompleted,
  updateExistingJob,
  type SuggestionResult,
} from "@/app/actions";
import { DaySuggestionPanel, type TimeSelection } from "@/components/DaySuggestionPanel";
import { CheckIcon } from "@/components/icons";
import type { JobRecord } from "@/lib/jobs";
import {
  ASSUMED_JOB_DURATION_MINUTES,
  formatMinutesAsClock,
  parseTimeToMinutes,
  type TimeSlotType,
} from "@/lib/scheduling";

const TIME_SLOT_OPTIONS: { value: TimeSlotType; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "specific", label: "Specific" },
  { value: "none", label: "Flexible" },
];

function timeSlotLabel(type: TimeSlotType): string {
  return TIME_SLOT_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function jobTimeLabel(job: JobRecord): string {
  return job.time_slot_type === "specific"
    ? job.specific_time
      ? formatMinutesAsClock(parseTimeToMinutes(job.specific_time))
      : "specific time"
    : timeSlotLabel(job.time_slot_type as TimeSlotType);
}

/** Blank means "use the flat default" everywhere this is threaded through. */
function parseDurationInput(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

/**
 * End-of-day review for one past date.
 *
 * Two phases: tick off what got done, then decide what to do with
 * whatever didn't. The day is finished when nothing on it is left at
 * `scheduled` — there's no separate "reviewed" flag to keep in sync.
 */
export function DayReview({ date, jobs }: { date: string; jobs: JobRecord[] }) {
  const router = useRouter();

  const [phase, setPhase] = useState<"check" | "resolve">("check");
  // Assume completed — unticking is the exception, not the rule.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(jobs.map((job) => job.id))
  );
  /** Jobs that weren't done and still need a decision. */
  const [pending, setPending] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** The job currently being rescheduled, and its fetched suggestion. */
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  // The time to rebook at. Starts as whatever the job already had, but a
  // job that didn't get done often needs a different time as well as a
  // different day, so it's editable here. Changing it re-ranks the days,
  // since a day whose afternoon is full is fine for a morning job.
  const [timeSlotType, setTimeSlotType] = useState<TimeSlotType>("none");
  const [specificTime, setSpecificTime] = useState("");
  // Carries the job's existing duration across the reschedule (or lets it
  // be corrected here — the one edit-in-place field this panel has, since
  // it doesn't otherwise expose a full edit form). Blank = flat default.
  const [durationMinutesInput, setDurationMinutesInput] = useState("");
  const durationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isConfirming, startConfirming] = useTransition();
  const [isResolving, startResolving] = useTransition();
  const [isLoadingSuggestion, startLoadingSuggestion] = useTransition();

  function toggle(jobId: string) {
    setCheckedIds((previous) => {
      const next = new Set(previous);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }

  /** Leaves the review once nothing on this day is awaiting a decision. */
  function finishIfDone(remaining: JobRecord[]) {
    if (remaining.length === 0) {
      router.push("/");
      router.refresh();
    }
  }

  function handleConfirmChecklist() {
    setError(null);
    const completed = jobs.filter((job) => checkedIds.has(job.id));
    const notDone = jobs.filter((job) => !checkedIds.has(job.id));

    startConfirming(async () => {
      try {
        await markJobsCompleted(completed.map((job) => job.id));
        setPending(notDone);
        setPhase("resolve");
        finishIfDone(notDone);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save the review.");
      }
    });
  }

  function removePending(jobId: string) {
    // finishIfDone (router.push/refresh) has to run as a plain statement
    // here, not inside the setPending updater above — that updater runs
    // during React's render phase, and triggering another component's
    // (the router's) state update from inside it is exactly what React
    // disallows. Safe to read `pending` directly rather than via the
    // functional form: both call sites are inside an async startResolving
    // callback, well past the render/event-handling phase, so there's no
    // queued update this could race.
    const remaining = pending.filter((job) => job.id !== jobId);
    setPending(remaining);
    setReschedulingId(null);
    setSuggestion(null);
    finishIfDone(remaining);
  }

  function handleDiscard(job: JobRecord) {
    setError(null);
    startResolving(async () => {
      try {
        await markJobCancelled(job.id);
        removePending(job.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to discard the job.");
      }
    });
  }

  /** Re-ranks the days for a given time. Called on opening the reschedule
   *  panel and again whenever the time is changed, because the day ranking
   *  is time-aware — a day whose afternoon is full still suits a morning
   *  job, so the old ranking can't be reused. */
  function loadSuggestion(
    job: JobRecord,
    type: TimeSlotType,
    time: string,
    durationMinutes: number | null
  ) {
    // Nothing meaningful to rank until an actual clock time is entered.
    if (type === "specific" && !time) {
      setSuggestion(null);
      return;
    }

    // Deliberately NOT setSuggestion(null) here. The render below is a
    // plain `{suggestion && <DaySuggestionPanel timeControl={...} />}` —
    // nulling this out doesn't just hide a loading state, it unmounts the
    // whole panel, which includes the duration input itself (passed in as
    // timeControl and rendered inside DaySuggestionPanel). That unmount is
    // what was destroying the input mid-typing. Keeping the last-known
    // suggestion mounted while a fresh one loads means React just updates
    // the existing instance's props once it arrives — isLoadingSuggestion
    // already shows a separate "Working out the best day..." note
    // alongside it, so there's still a visible loading cue.
    startLoadingSuggestion(async () => {
      try {
        const result = await getSchedulingSuggestion(
          job.address,
          { type, specificTime: type === "specific" ? time : undefined },
          // Exclude the job being moved, so the engine doesn't route
          // around the very thing it's relocating.
          job.id,
          durationMinutes
        );
        setSuggestion(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not work out a new day.");
      }
    });
  }

  function handleStartReschedule(job: JobRecord) {
    setError(null);
    setReschedulingId(job.id);

    const type = job.time_slot_type as TimeSlotType;
    const time = job.specific_time ?? "";
    const durationInput = job.duration_minutes?.toString() ?? "";
    setTimeSlotType(type);
    setSpecificTime(time);
    setDurationMinutesInput(durationInput);
    loadSuggestion(job, type, time, job.duration_minutes);
  }

  function handleTimeSlotTypeChange(job: JobRecord, type: TimeSlotType) {
    setError(null);
    setTimeSlotType(type);
    loadSuggestion(job, type, specificTime, parseDurationInput(durationMinutesInput));
  }

  function handleSpecificTimeChange(job: JobRecord, time: string) {
    setError(null);
    setSpecificTime(time);
    loadSuggestion(job, timeSlotType, time, parseDurationInput(durationMinutesInput));
  }

  // Debounced, unlike the time/type handlers above — those fire on a
  // single discrete pick, but duration is free-text typing, and
  // re-suggesting (which clears `suggestion` and unmounts the panel while
  // it refetches) on every keystroke was making the field unusable.
  function handleDurationChange(job: JobRecord, value: string) {
    setError(null);
    setDurationMinutesInput(value);

    if (durationDebounceRef.current) {
      clearTimeout(durationDebounceRef.current);
    }
    durationDebounceRef.current = setTimeout(() => {
      loadSuggestion(job, timeSlotType, specificTime, parseDurationInput(value));
    }, 500);
  }

  function handleRescheduleConfirm(job: JobRecord, newDate: string, time: TimeSelection) {
    setError(null);
    startResolving(async () => {
      try {
        // Updates the existing row rather than creating a second job.
        await updateExistingJob({
          id: job.id,
          address: job.address,
          date: newDate,
          timeSlotType: time.type,
          specificTime: time.specificTime,
          customerName: job.customer_name,
          description: job.description ?? "",
          durationMinutes: parseDurationInput(durationMinutesInput),
        });
        removePending(job.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reschedule the job.");
      }
    });
  }

  if (phase === "check") {
    return (
      <div>
        {error && <p className="error-text">{error}</p>}
        <p className="note">
          Checked jobs are marked done. Uncheck anything that didn&apos;t happen.
        </p>

        {jobs.map((job) => {
          const isChecked = checkedIds.has(job.id);
          return (
            <button
              key={job.id}
              type="button"
              className={`check-row${isChecked ? " is-checked" : ""}`}
              onClick={() => toggle(job.id)}
            >
              <span className="check-box">{isChecked && <CheckIcon />}</span>
              <span style={{ flex: 1 }}>
                <span className="stop-name">{job.customer_name}</span>
                <span className="stop-address" style={{ display: "block" }}>
                  {job.address}
                </span>
              </span>
              <span className="stop-time">{jobTimeLabel(job)}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="btn btn--primary btn--block"
          style={{ marginTop: 18 }}
          onClick={handleConfirmChecklist}
          disabled={isConfirming}
        >
          {isConfirming ? "Saving..." : "Confirm Reviewed"}
        </button>
        <button
          type="button"
          className="btn--quiet"
          style={{ display: "block", margin: "12px auto 0" }}
          onClick={() => router.push("/")}
          disabled={isConfirming}
        >
          Not now
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="error-text">{error}</p>}
      <div className="section-label" style={{ marginBottom: 10 }}>
        Needs a decision
      </div>
      <p className="note">
        {pending.length} job{pending.length === 1 ? "" : "s"} didn&apos;t get done.
        Discard each one, or find it a new day.
      </p>

      {pending.map((job) => (
        <div key={job.id} className="decision-card">
          <div className="stop-name">{job.customer_name}</div>
          <div className="stop-address">{job.address}</div>
          <div className="stop-time" style={{ marginBottom: 12 }}>
            {jobTimeLabel(job)}
          </div>

          {reschedulingId === job.id ? (
            <>
              {(() => {
                // Built once and reused: passed into DaySuggestionPanel once a
                // suggestion exists (so day and time sit together), but also
                // rendered directly below while none exists yet — otherwise
                // picking "Specific" with no time set yet (which holds off
                // fetching a suggestion) would hide the very controls needed
                // to enter a time or switch away, leaving no way out short of
                // cancelling the whole reschedule.
                const timeControlNode = (
                  <>
                    <span className="field-label">Time</span>
                    <div className="chips">
                      {TIME_SLOT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`chip${
                            timeSlotType === option.value ? " is-selected" : ""
                          }`}
                          onClick={() => handleTimeSlotTypeChange(job, option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {timeSlotType === "specific" && (
                      <input
                        className="input input--time"
                        style={{ marginTop: 8 }}
                        type="time"
                        placeholder="Select a time"
                        value={specificTime}
                        onChange={(e) => handleSpecificTimeChange(job, e.target.value)}
                      />
                    )}
                    <span className="field-label" style={{ marginTop: 10, display: "block" }}>
                      Duration (minutes)
                    </span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      step="1"
                      placeholder={`Defaults to ${ASSUMED_JOB_DURATION_MINUTES} min`}
                      value={durationMinutesInput}
                      onChange={(e) => handleDurationChange(job, e.target.value)}
                    />
                  </>
                );

                if (!suggestion) {
                  return (
                    <div className="field">
                      {timeControlNode}
                      {timeSlotType === "specific" && !specificTime && (
                        <p className="note" style={{ marginTop: 10 }}>
                          Pick a time to see which days it fits.
                        </p>
                      )}
                      {isLoadingSuggestion && (
                        <p className="note" style={{ marginTop: 10 }}>
                          Working out the best day...
                        </p>
                      )}
                    </div>
                  );
                }

                return (
                  <>
                    {isLoadingSuggestion && <p className="note">Working out the best day...</p>}
                    <DaySuggestionPanel
                      suggestion={suggestion}
                      jobId={job.id}
                      requestedTime={{ type: timeSlotType, specificTime }}
                      durationMinutes={parseDurationInput(durationMinutesInput)}
                      // The day it was booked for has been and gone, so
                      // "keep it" isn't a meaningful option here.
                      currentDate={null}
                      currentDateInfo={null}
                      requestedTimeLabel={
                        timeSlotType === "specific" && specificTime
                          ? formatMinutesAsClock(parseTimeToMinutes(specificTime))
                          : timeSlotLabel(timeSlotType)
                      }
                      timeControl={timeControlNode}
                      isSaving={isResolving}
                      onConfirm={(newDate, time) =>
                        handleRescheduleConfirm(job, newDate, time)
                      }
                    />
                  </>
                );
              })()}
              <button
                type="button"
                className="btn btn--outline btn--block btn--sm"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setReschedulingId(null);
                  setSuggestion(null);
                }}
                disabled={isResolving}
              >
                Cancel
              </button>
            </>
          ) : (
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => handleDiscard(job)}
                disabled={isResolving}
              >
                Discard
              </button>
              <button
                type="button"
                className="btn btn--warning"
                onClick={() => handleStartReschedule(job)}
                disabled={isResolving}
              >
                Reschedule
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
