"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  confirmAndSaveJob,
  getAddressSuggestions,
  getDayRouteInfo,
  getDayTimeSuggestion,
  getSchedulingSuggestion,
  type SuggestionResult,
  type TimeSuggestion,
} from "@/app/actions";
import { PinIcon } from "@/components/icons";
import { formatDistance, formatSuggestionDate, type DistanceUnit } from "@/lib/format";
import type { AddressSuggestion } from "@/lib/geocoding";
import { ASSUMED_JOB_DURATION_MINUTES, type DayRoute, type TimeSlotType } from "@/lib/scheduling";
import { getTodayDateString } from "@/lib/week";

const TIME_SLOT_OPTIONS: { value: TimeSlotType; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
  { value: "specific", label: "Specific" },
  { value: "none", label: "Flexible" },
];

function dayDetailLine(day: DayRoute, unit: DistanceUnit): string {
  const jobLabel = `${day.jobCount} job${day.jobCount === 1 ? "" : "s"}`;
  return `${jobLabel} booked · adds ${formatDistance(day.addedDistanceKm, unit)} · day route ${formatDistance(day.totalDistanceKm, unit)}`;
}

// Outside this range the "Nx further" comparison stops being informative:
// a day whose only job sits right next to home makes the ratio explode
// into nonsense like "1777x", and anything under 2x isn't worth saying at
// all. The plain km figure already carries the message in both cases.
const MIN_USEFUL_DISTANCE_MULTIPLIER = 2;
const MAX_USEFUL_DISTANCE_MULTIPLIER = 20;

function distanceComparisonLabel(day: DayRoute): string | null {
  if (!day.typicalSpacingKm || day.typicalSpacingKm <= 0) return null;
  const multiplier = Math.round(day.addedDistanceKm / day.typicalSpacingKm);
  if (multiplier < MIN_USEFUL_DISTANCE_MULTIPLIER) return null;
  if (multiplier > MAX_USEFUL_DISTANCE_MULTIPLIER) return null;
  return `roughly ${multiplier}x further than your other job(s) that day`;
}

export function NewJobForm({ distanceUnit }: { distanceUnit: DistanceUnit }) {
  const router = useRouter();

  const [address, setAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutesInput, setDurationMinutesInput] = useState("");
  const [timeSlotType, setTimeSlotType] = useState<TimeSlotType>("none");
  const [specificTime, setSpecificTime] = useState("");

  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [selectedDate, setSelectedDateRaw] = useState("");
  // Which ranked candidate day is currently on offer. Days are shown one
  // at a time and stepped through with "Try next best", rather than
  // listed side by side to compare.
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [customDate, setCustomDate] = useState("");
  const [customDateInfo, setCustomDateInfo] = useState<DayRoute | null>(null);
  const [customDateError, setCustomDateError] = useState<string | null>(null);
  const customDateRequestRef = useRef<string>("");
  const [warningDay, setWarningDay] = useState<DayRoute | null>(null);
  // Whether to adopt the suggested time. A plain boolean rather than a
  // slot value, because the suggestion can now be a "specific" time and
  // so can the requested time — comparing slot values couldn't tell the
  // two options apart.
  const [acceptTimeSuggestion, setAcceptTimeSuggestion] = useState(false);
  // The time suggestion for whichever day is currently selected — kept in
  // sync as the selected day changes, rather than staying frozen on the
  // day the initial suggestion happened to pick.
  const [selectedDayTimeSuggestion, setSelectedDayTimeSuggestion] =
    useState<TimeSuggestion | null>(null);
  const timeSuggestionRequestRef = useRef<string>("");

  const [error, setError] = useState<string | null>(null);

  const [isSuggesting, startSuggesting] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [isCheckingCustomDate, startCheckingCustomDate] = useTransition();
  const [isCheckingTimeSuggestion, startCheckingTimeSuggestion] = useTransition();

  // Blank means "use the flat default" everywhere this is threaded through.
  const durationMinutes = durationMinutesInput.trim()
    ? Number(durationMinutesInput)
    : null;

  function handleDurationChange(value: string) {
    setDurationMinutesInput(value);
    invalidateSuggestion();
  }

  function setSelectedDate(date: string) {
    setSelectedDateRaw(date);
    setWarningDay(null);
  }

  function resetCustomDateState() {
    setCustomDate("");
    setCustomDateInfo(null);
    setCustomDateError(null);
    customDateRequestRef.current = "";
  }

  // A fetched suggestion is only valid for the exact inputs it was computed
  // from — once any of those change, drop it so a stale panel can't linger.
  function invalidateSuggestion() {
    setSuggestion(null);
    setWarningDay(null);
    resetCustomDateState();
    setSelectedDayTimeSuggestion(null);
    timeSuggestionRequestRef.current = "";
    setCandidateIndex(0);
  }

  // Recomputes the time suggestion for whatever day was just selected.
  // Reuses the original suggestion's answer when it's for the same day;
  // otherwise fetches fresh, since a different day can have entirely
  // different neighboring jobs.
  function refreshTimeSuggestionFor(date: string) {
    if (!suggestion) return;
    timeSuggestionRequestRef.current = date;

    if (!suggestion.timeSuggestion) {
      setSelectedDayTimeSuggestion(null);
      return;
    }

    if (date === suggestion.suggestion.day.date) {
      setSelectedDayTimeSuggestion(suggestion.timeSuggestion);
      setAcceptTimeSuggestion(suggestion.timeSuggestion.fits);
      return;
    }

    const coordinates = suggestion.coordinates;
    setSelectedDayTimeSuggestion(null);
    startCheckingTimeSuggestion(async () => {
      try {
        const result = await getDayTimeSuggestion(
          coordinates,
          {
            type: timeSlotType,
            specificTime: timeSlotType === "specific" ? specificTime : undefined,
          },
          date,
          undefined,
          durationMinutes
        );
        if (timeSuggestionRequestRef.current === date) {
          setSelectedDayTimeSuggestion(result);
          setAcceptTimeSuggestion(result?.fits ?? false);
        }
      } catch {
        if (timeSuggestionRequestRef.current === date) {
          setSelectedDayTimeSuggestion(null);
        }
      }
    });
  }

  function selectDay(date: string) {
    setSelectedDate(date);
    refreshTimeSuggestionFor(date);
  }

  function handleAddressChange(value: string) {
    setAddress(value);
    setShowAddressSuggestions(true);
    invalidateSuggestion();

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

  function handleSelectAddressSuggestion(addressSuggestion: AddressSuggestion) {
    setAddress(addressSuggestion.placeName);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }

  function handleTimeSlotTypeChange(value: TimeSlotType) {
    setTimeSlotType(value);
    invalidateSuggestion();
  }

  function handleSpecificTimeChange(value: string) {
    setSpecificTime(value);
    invalidateSuggestion();
  }

  function handleGetSuggestion(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuggestion(null);
    setWarningDay(null);
    resetCustomDateState();
    setCandidateIndex(0);

    if (!address.trim() || !customerName.trim()) {
      setError("Address and customer name are required.");
      return;
    }
    if (timeSlotType === "specific" && !specificTime) {
      setError("Pick a specific time, or choose a different time option.");
      return;
    }
    if (durationMinutesInput.trim() && (!Number.isFinite(durationMinutes) || (durationMinutes ?? 0) <= 0)) {
      setError("Duration must be a positive number of minutes, or left blank.");
      return;
    }

    startSuggesting(async () => {
      try {
        const result = await getSchedulingSuggestion(
          address,
          {
            type: timeSlotType,
            specificTime: timeSlotType === "specific" ? specificTime : undefined,
          },
          undefined,
          durationMinutes
        );
        setSuggestion(result);
        setSelectedDate(result.suggestion.day.date);
        setAcceptTimeSuggestion(result.timeSuggestion?.fits ?? false);
        setSelectedDayTimeSuggestion(result.timeSuggestion);
        timeSuggestionRequestRef.current = result.suggestion.day.date;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleCustomDateChange(value: string) {
    setCustomDate(value);
    setCustomDateInfo(null);
    setCustomDateError(null);
    customDateRequestRef.current = value;

    if (value) {
      selectDay(value);
    } else if (activeCandidate) {
      // Cleared the manual date — fall back to the day currently on
      // offer, rather than leaving a date that's no longer on screen as
      // the one that actually gets saved.
      selectDay(activeCandidate.date);
    }

    if (!value || !suggestion) return;

    startCheckingCustomDate(async () => {
      try {
        const info = await getDayRouteInfo(
          suggestion.coordinates,
          {
            type: timeSlotType,
            specificTime: timeSlotType === "specific" ? specificTime : undefined,
          },
          value,
          undefined,
          durationMinutes
        );
        if (customDateRequestRef.current === value) {
          setCustomDateInfo(info);
        }
      } catch (err) {
        if (customDateRequestRef.current === value) {
          setCustomDateError(
            err instanceof Error ? err.message : "Could not check that date."
          );
        }
      }
    });
  }

  function getSelectedDayInfo(): DayRoute | undefined {
    if (!suggestion) return undefined;
    const fromAllDays = suggestion.allDays.find((d) => d.date === selectedDate);
    if (fromAllDays) return fromAllDays;
    if (customDateInfo && customDateInfo.date === selectedDate) return customDateInfo;
    return undefined;
  }

  function getFinalTimeSelection(): { type: TimeSlotType; specificTime: string | null } {
    const suggested = selectedDayTimeSuggestion;
    if (acceptTimeSuggestion && suggested?.fits && suggested.slot) {
      return { type: suggested.slot, specificTime: suggested.specificTime };
    }
    return {
      type: timeSlotType,
      specificTime: timeSlotType === "specific" ? specificTime : null,
    };
  }

  function doSave() {
    if (!suggestion) return;
    const finalTime = getFinalTimeSelection();

    startSaving(async () => {
      try {
        await confirmAndSaveJob({
          address: suggestion.formattedAddress,
          latitude: suggestion.coordinates.latitude,
          longitude: suggestion.coordinates.longitude,
          date: selectedDate,
          timeSlotType: finalTime.type,
          specificTime: finalTime.specificTime,
          customerName,
          description,
          durationMinutes,
        });
        // Add is its own screen now, so a saved job returns to the week
        // rather than clearing the form in place.
        router.push("/");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save job.");
      }
    });
  }

  function handleConfirmClick() {
    if (!suggestion) return;
    if (!selectedDate) {
      setError("Pick a date before confirming.");
      return;
    }
    setError(null);

    const dayInfo = getSelectedDayInfo();
    const hasDistanceWarning =
      dayInfo && dayInfo.addedDistanceKm > suggestion.maxTravelRangeKm;
    const hasTimeWarning =
      dayInfo?.timeFeasibility &&
      (dayInfo.timeFeasibility.previousConflict || dayInfo.timeFeasibility.nextConflict);
    const hasCapacityWarning =
      dayInfo &&
      suggestion.maxJobsPerDay !== null &&
      dayInfo.jobCount >= suggestion.maxJobsPerDay;
    const hasUnbookableWarning = dayInfo?.timeOption && !dayInfo.timeOption.fits;

    if (
      dayInfo &&
      (hasDistanceWarning || hasTimeWarning || hasCapacityWarning || hasUnbookableWarning)
    ) {
      setWarningDay(dayInfo);
      return;
    }

    doSave();
  }

  const warningComparison = warningDay ? distanceComparisonLabel(warningDay) : null;

  const candidates = suggestion ? suggestion.allDays : [];
  const activeCandidate = candidates[candidateIndex] ?? null;
  const hasMoreCandidates = candidateIndex < candidates.length - 1;
  const isUsingCustomDate = customDate !== "" && selectedDate === customDate;

  function handleTryNextBest() {
    const nextIndex = candidateIndex + 1;
    if (nextIndex >= candidates.length) return;
    setCandidateIndex(nextIndex);
    resetCustomDateState();
    selectDay(candidates[nextIndex].date);
  }

  function handleUseSuggestedDay() {
    if (!activeCandidate) return;
    resetCustomDateState();
    selectDay(activeCandidate.date);
  }

  // The suggestion surface takes its tone from what the engine actually
  // concluded, so a clustered or no-fit answer never wears the confident
  // teal of a genuine recommendation.
  function suggestionTone(): { className: string; label: string } {
    if (!suggestion) return { className: "suggest", label: "Suggested" };
    if (candidateIndex > 0) return { className: "suggest", label: "Next best" };
    if (isUsingCustomDate) return { className: "suggest", label: "Your date" };
    switch (suggestion.suggestion.kind) {
      case "clustered":
        return { className: "suggest suggest--accent", label: "Groups with a nearby job" };
      case "none":
        return { className: "suggest suggest--warn", label: "No great fit" };
      default:
        return { className: "suggest", label: "Suggested" };
    }
  }

  const tone = suggestionTone();
  const shownDay = isUsingCustomDate ? customDateInfo : activeCandidate;
  const timeLabel =
    acceptTimeSuggestion && selectedDayTimeSuggestion?.fits
      ? selectedDayTimeSuggestion.label
      : timeSlotType === "specific" && specificTime
        ? specificTime
        : TIME_SLOT_OPTIONS.find((o) => o.value === timeSlotType)?.label ?? "";

  return (
    <div>
      <form onSubmit={handleGetSuggestion}>
        <div className="field">
          <label className="field-label" htmlFor="job-address">
            Address
          </label>
          <input
            id="job-address"
            className="input"
            value={address}
            onChange={(e) => handleAddressChange(e.target.value)}
            onFocus={() => setShowAddressSuggestions(true)}
            onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 150)}
            placeholder="Where's the job?"
            autoComplete="off"
            required
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
          <label className="field-label" htmlFor="job-customer">
            Customer name
          </label>
          <input
            id="job-customer"
            className="input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Who's the customer?"
            required
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="job-description">
            Description (optional)
          </label>
          <textarea
            id="job-description"
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's the job?"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="job-duration">
            Duration in minutes (optional)
          </label>
          <input
            id="job-duration"
            className="input"
            type="number"
            min={1}
            step="1"
            value={durationMinutesInput}
            onChange={(e) => handleDurationChange(e.target.value)}
            placeholder={`Defaults to ${ASSUMED_JOB_DURATION_MINUTES} min`}
          />
          <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
            How long this job actually takes — a real number here stops
            quick jobs from silently crowding out longer ones nearby.
          </p>
        </div>

        <div className="field">
          <span className="field-label">Time</span>
          <div className="chips">
            {TIME_SLOT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`chip${timeSlotType === option.value ? " is-selected" : ""}`}
                onClick={() => handleTimeSlotTypeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {timeSlotType === "specific" && (
            <input
              className="input input--time"
              style={{ marginTop: 10 }}
              type="time"
              placeholder="Select a time"
              value={specificTime}
              onChange={(e) => handleSpecificTimeChange(e.target.value)}
              required
            />
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        {!suggestion && (
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={isSuggesting}
          >
            {isSuggesting ? "Finding the best day..." : "Find the best day"}
          </button>
        )}
      </form>

      {suggestion && (
        <>
          <div className={tone.className}>
            <div className="suggest-label">{tone.label}</div>
            <div className="suggest-headline">
              {shownDay ? formatSuggestionDate(shownDay.date) : selectedDate}
              {timeLabel ? ` · ${timeLabel}` : ""}
            </div>

            {suggestion.suggestion.kind === "clustered" && candidateIndex === 0 && (
              <p className="suggest-body">
                Pairs with your existing job at{" "}
                <strong>{suggestion.suggestion.clusterJobLabel ?? "another job"}</strong>.
                No day is close to home, but grouping distant work beats two
                separate trips.
              </p>
            )}
            {suggestion.suggestion.kind === "none" && candidateIndex === 0 && (
              <p className="suggest-body">
                Nothing on this week&apos;s route is really nearby. This is the
                closest option — worth checking another week, or accepting the
                extra driving.
              </p>
            )}

            {shownDay && (
              <div className="suggest-meta">
                {dayDetailLine(shownDay, distanceUnit)}
                {shownDay.timeOption && !shownDay.timeOption.fits && (
                  <span className="badge">No free time</span>
                )}
                {suggestion.maxJobsPerDay !== null &&
                  shownDay.jobCount >= suggestion.maxJobsPerDay && (
                    <span className="badge">Day full</span>
                  )}
              </div>
            )}
            {isCheckingCustomDate && <div className="suggest-meta">Checking...</div>}
            {customDateError && <p className="error-text">{customDateError}</p>}

            {suggestion.timeSuggestion && (
              <p className="suggest-body" style={{ marginTop: 8 }}>
                {isCheckingTimeSuggestion && "Checking the best time for that day..."}
                {!isCheckingTimeSuggestion && selectedDayTimeSuggestion && (
                  <>
                    {selectedDayTimeSuggestion.fits ? (
                      <>
                        <strong>{selectedDayTimeSuggestion.label}</strong> —{" "}
                      </>
                    ) : (
                      <strong className="text-warning">No time fits: </strong>
                    )}
                    {selectedDayTimeSuggestion.reasoning}
                  </>
                )}
              </p>
            )}

            {selectedDayTimeSuggestion?.fits && (
              <div className="chips" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className={`chip${acceptTimeSuggestion ? " is-selected" : ""}`}
                  onClick={() => setAcceptTimeSuggestion(true)}
                >
                  Use {selectedDayTimeSuggestion.label}
                </button>
                <button
                  type="button"
                  className={`chip${!acceptTimeSuggestion ? " is-selected" : ""}`}
                  onClick={() => setAcceptTimeSuggestion(false)}
                >
                  Keep {TIME_SLOT_OPTIONS.find((o) => o.value === timeSlotType)?.label}
                </button>
              </div>
            )}

            <div className="suggest-actions">
              {hasMoreCandidates && !isUsingCustomDate && (
                <button
                  type="button"
                  className="btn btn--outline btn--block"
                  onClick={handleTryNextBest}
                >
                  Not free? Try next best
                </button>
              )}
              {!hasMoreCandidates && !isUsingCustomDate && (
                <p className="suggest-meta">
                  That&apos;s every day this week — pick your own date below.
                </p>
              )}

              {isUsingCustomDate && (
                <button type="button" className="btn--link" onClick={handleUseSuggestedDay}>
                  Use the suggested day instead
                </button>
              )}

              {/* Always visible and always labelled. It used to hide behind
                  a "pick a different date" link, which cost an extra tap and
                  left an unlabelled empty box — iOS draws no placeholder in
                  an empty date input, so it read as a blank white panel. */}
              <div>
                <label className="field-label" htmlFor="job-custom-date">
                  Different date
                </label>
                <div className="input-wrap">
                  <input
                    id="job-custom-date"
                    className="input"
                    type="date"
                    min={getTodayDateString()}
                    value={customDate}
                    onChange={(e) => handleCustomDateChange(e.target.value)}
                  />
                  {!customDate && <span className="input-placeholder">Select a date</span>}
                </div>
              </div>
            </div>
          </div>

          {warningDay && (
            <div className="warn-block">
              {warningDay.addedDistanceKm > suggestion.maxTravelRangeKm && (
                <p>
                  This adds {formatDistance(warningDay.addedDistanceKm, distanceUnit)} of extra driving
                  on {warningDay.date}
                  {warningComparison && <> — {warningComparison}</>}.
                </p>
              )}
              {suggestion.maxJobsPerDay !== null &&
                warningDay.jobCount >= suggestion.maxJobsPerDay && (
                  <p>
                    This day already has {warningDay.jobCount} job
                    {warningDay.jobCount === 1 ? "" : "s"} booked — your limit is{" "}
                    {suggestion.maxJobsPerDay}.
                  </p>
                )}
              {warningDay.timeFeasibility?.previousConflict && (
                <p>
                  Your previous job that day takes about{" "}
                  {warningDay.previousNeighbor.durationMinutes} minutes, plus roughly a{" "}
                  {Math.round(warningDay.timeFeasibility.previousTravelMinutes ?? 0)}-minute
                  drive — but they&apos;re only booked{" "}
                  {Math.round(warningDay.timeFeasibility.previousGapMinutes ?? 0)} minutes
                  apart.
                </p>
              )}
              {warningDay.timeFeasibility?.nextConflict && (
                <p>
                  This job takes about {durationMinutes ?? ASSUMED_JOB_DURATION_MINUTES}{" "}
                  minutes, plus roughly a{" "}
                  {Math.round(warningDay.timeFeasibility.nextTravelMinutes ?? 0)}-minute
                  drive to your next job that day — but they&apos;re only booked{" "}
                  {Math.round(warningDay.timeFeasibility.nextGapMinutes ?? 0)} minutes
                  apart.
                </p>
              )}
              {warningDay.timeOption && !warningDay.timeOption.fits && (
                <p>
                  {selectedDayTimeSuggestion?.reasoning ??
                    "This day doesn't have room for this job once travel time and working hours are counted."}
                </p>
              )}
              <button
                type="button"
                className="btn btn--warning btn--block"
                style={{ marginTop: 10 }}
                onClick={doSave}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Book it anyway"}
              </button>
            </div>
          )}

          {!warningDay && (
            <button
              type="button"
              className="btn btn--primary btn--block"
              style={{ marginTop: 16 }}
              onClick={handleConfirmClick}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Confirm Job"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
