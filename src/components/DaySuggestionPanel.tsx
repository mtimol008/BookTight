"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  getDayRouteInfo,
  getDayTimeSuggestion,
  type SuggestionResult,
  type TimeSuggestion,
} from "@/app/actions";
import { formatDistance, formatSuggestionDate, type DistanceUnit } from "@/lib/format";
import { ASSUMED_JOB_DURATION_MINUTES, type DayRoute, type TimeSlotType } from "@/lib/scheduling";
import { getTodayDateString } from "@/lib/week";

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

export interface TimeSelection {
  type: TimeSlotType;
  specificTime: string | null;
}

export interface DaySuggestionPanelProps {
  /** Already-fetched suggestion for the job being placed. */
  suggestion: SuggestionResult;
  /** The job being moved — excluded from on-demand route lookups so the
   *  engine never routes around the job it's relocating. */
  jobId: string;
  distanceUnit?: DistanceUnit;
  /** The time the suggestion was computed for, and the fallback used when
   *  the suggested time isn't adopted. */
  requestedTime: { type: TimeSlotType; specificTime: string };
  /** The job's duration, in the same terms threaded through suggestBestDay
   *  — null means "use the flat default". Kept in sync with whatever the
   *  host's own duration field currently holds. */
  durationMinutes: number | null;
  /** The job's current date when keeping it is still a real option (the
   *  edit flow), or null when it isn't (rescheduling a day that's gone). */
  currentDate: string | null;
  /** Route info for currentDate when it isn't among the ranked candidates
   *  — e.g. it has already passed, so it was filtered out. */
  currentDateInfo: DayRoute | null;
  /** How the job's existing time reads, e.g. "Afternoon" or "14:30". Used
   *  both for the "keep it" option and to show what will actually be
   *  saved — a reschedule carries the booked time across, and that should
   *  never be something the user has to infer. */
  requestedTimeLabel: string;
  /** Optional control for changing the time, rendered directly under
   *  "Different date" so day and time sit together as one choice. Hosts
   *  that pick the time elsewhere (the jobs table's edit row) omit it. */
  timeControl?: ReactNode;
  isSaving: boolean;
  onConfirm: (date: string, time: TimeSelection) => void;
}

/**
 * Picks which day and time a job should land on: steps through the ranked
 * candidates one at a time, allows a manually typed date, keeps the time
 * suggestion in sync with whichever day is selected, and gates saving
 * behind the distance/feasibility warnings.
 *
 * Shared by the jobs table's edit flow and the end-of-day review's
 * reschedule. The two differ only in whether keeping the job's current
 * date is a meaningful option, which is what `currentDate` expresses.
 */
export function DaySuggestionPanel({
  suggestion,
  jobId,
  requestedTime,
  durationMinutes,
  currentDate,
  currentDateInfo,
  requestedTimeLabel,
  timeControl,
  isSaving,
  onConfirm,
  distanceUnit,
}: DaySuggestionPanelProps) {
  const [selectedDate, setSelectedDateRaw] = useState(
    currentDate ?? suggestion.suggestion.day.date
  );
  // Which alternative day is currently on offer. Days are shown one at a
  // time and stepped through, rather than listed side by side to compare.
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [customDate, setCustomDate] = useState("");
  const [customDateInfo, setCustomDateInfo] = useState<DayRoute | null>(null);
  const [customDateError, setCustomDateError] = useState<string | null>(null);
  const customDateRequestRef = useRef<string>("");
  const [warningDay, setWarningDay] = useState<DayRoute | null>(null);
  // Whether to adopt the suggested time. A plain boolean rather than a
  // slot value, because the suggestion can be a "specific" time and so can
  // the job's current time — comparing slot values couldn't tell "use the
  // suggestion" from "keep what's booked" apart.
  const [acceptTimeSuggestion, setAcceptTimeSuggestion] = useState(false);
  // The time suggestion for whichever day is selected — kept in sync as
  // the day changes, rather than frozen on the originally suggested one.
  const [selectedDayTimeSuggestion, setSelectedDayTimeSuggestion] =
    useState<TimeSuggestion | null>(null);
  const timeSuggestionRequestRef = useRef<string>("");

  const [isCheckingCustomDate, startCheckingCustomDate] = useTransition();
  const [isCheckingTimeSuggestion, startCheckingTimeSuggestion] = useTransition();
  const unit = distanceUnit ?? suggestion.distanceUnit ?? "km";
 
  // The time this panel is placing, in the shape the actions expect.
  const panelRequestedTime = {
    type: requestedTime.type,
    specificTime:
      requestedTime.type === "specific" ? requestedTime.specificTime : undefined,
  };

  // Tracks the last (day order, host context) this effect reset against —
  // NOT suggestion identity. getSchedulingSuggestion returns a brand-new
  // object every call, including quiet duration-only refetches where the
  // ranked days haven't actually reordered — comparing suggestion by
  // reference would reset the user's browsing position (which day/
  // candidate they're looking at) on every one of those, even though
  // nothing they were looking at actually became invalid.
  const rankingIdentityRef = useRef<string | null>(null);

  // A genuinely new RANKING (the day order actually changed, or this panel
  // now represents a different job/current-date context) means start the
  // choice over. A quiet refresh (duration changed but the same days are
  // still in the same order) just refreshes the time suggestion for
  // whatever day is currently selected, in place — done as a reset rather
  // than by remounting on a key, so a host that renders its own time
  // control inside this panel doesn't lose input focus while typing.
  useEffect(() => {
    const dayOrder = suggestion.allDays.map((day) => day.date).join(",");
    const rankingIdentity = `${dayOrder}|${currentDate ?? ""}|${jobId}`;
    const isNewRanking = rankingIdentityRef.current !== rankingIdentity;
    rankingIdentityRef.current = rankingIdentity;

    // When not resetting, keep refreshing whatever day is already
    // selected — timeSuggestionRequestRef always holds that, kept in sync
    // both by this effect's own resets and by explicit day switches
    // (selectDay/refreshTimeSuggestionFor), so it's accurate either way.
    const targetDate = isNewRanking
      ? currentDate ?? suggestion.suggestion.day.date
      : timeSuggestionRequestRef.current;

    if (isNewRanking) {
      setSelectedDateRaw(targetDate);
      setCandidateIndex(0);
      setCustomDate("");
      setCustomDateInfo(null);
      setCustomDateError(null);
      customDateRequestRef.current = "";
      setWarningDay(null);
      setAcceptTimeSuggestion(false);
    }
    timeSuggestionRequestRef.current = targetDate;

    if (!suggestion.timeSuggestion) {
      setSelectedDayTimeSuggestion(null);
      return;
    }
    if (targetDate === suggestion.suggestion.day.date) {
      setSelectedDayTimeSuggestion(suggestion.timeSuggestion);
      return;
    }

    let cancelled = false;
    getDayTimeSuggestion(
      suggestion.coordinates,
      panelRequestedTime,
      targetDate,
      jobId,
      durationMinutes
    )
      .then((result) => {
        if (!cancelled && timeSuggestionRequestRef.current === targetDate) {
          setSelectedDayTimeSuggestion(result);
        }
      })
      .catch(() => {
        if (!cancelled && timeSuggestionRequestRef.current === targetDate) {
          setSelectedDayTimeSuggestion(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [suggestion, currentDate, jobId, durationMinutes]);

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

  // Recomputes the time suggestion for whatever day was just selected.
  // Reuses the original answer when it's for the same day; otherwise
  // fetches fresh, since a different day has different neighbouring jobs.
  // Always resets the choice back to "keep the current time" on a switch,
  // rather than carrying forward a pick tied to the old day.
  function refreshTimeSuggestionFor(date: string) {
    timeSuggestionRequestRef.current = date;
    setAcceptTimeSuggestion(false);

    if (!suggestion.timeSuggestion) {
      setSelectedDayTimeSuggestion(null);
      return;
    }

    if (date === suggestion.suggestion.day.date) {
      setSelectedDayTimeSuggestion(suggestion.timeSuggestion);
      return;
    }

    setSelectedDayTimeSuggestion(null);
    startCheckingTimeSuggestion(async () => {
      try {
        const result = await getDayTimeSuggestion(
          suggestion.coordinates,
          panelRequestedTime,
          date,
          jobId,
          durationMinutes
        );
        // Ignore this response if the selected day has moved on since we
        // asked — a slow request shouldn't clobber a newer selection.
        if (timeSuggestionRequestRef.current === date) {
          setSelectedDayTimeSuggestion(result);
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

  // The day the job is already on is shown in its own block, so "next
  // best" should never re-offer it.
  const alternatives = currentDate
    ? suggestion.allDays.filter((d) => d.date !== currentDate)
    : suggestion.allDays;
  const activeCandidate = alternatives[candidateIndex] ?? null;
  const hasMoreCandidates = candidateIndex < alternatives.length - 1;
  // Only badge the offer as the engine's actual pick when it really is —
  // if the current date happens to be allDays[0], alternatives[0] is
  // merely the runner-up.
  const isEnginePick =
    !!activeCandidate && activeCandidate.date === suggestion.suggestion.day.date;
  const isUsingCurrentDate = currentDate !== null && selectedDate === currentDate;
  const isUsingCustomDate = customDate !== "" && selectedDate === customDate;
  const resolvedCurrentDateInfo =
    (currentDate ? suggestion.allDays.find((d) => d.date === currentDate) : null) ??
    currentDateInfo;

  function handleTryNextBest() {
    const nextIndex = candidateIndex + 1;
    if (nextIndex >= alternatives.length) return;
    setCandidateIndex(nextIndex);

    // Only move the selection along with the offer if an alternative was
    // already the chosen day. Browsing options shouldn't drag someone off
    // "keep the current date" they never actually left.
    const wasOnAlternative = alternatives.some((d) => d.date === selectedDate);
    if (wasOnAlternative) {
      resetCustomDateState();
      selectDay(alternatives[nextIndex].date);
    }
  }

  function handleCustomDateChange(value: string) {
    setCustomDate(value);
    setCustomDateInfo(null);
    setCustomDateError(null);
    customDateRequestRef.current = value;

    if (value) {
      selectDay(value);
    } else {
      // Cleared the manual date — fall back to a day that's still on
      // screen, rather than leaving an invisible one as what gets saved.
      selectDay(currentDate ?? activeCandidate?.date ?? suggestion.suggestion.day.date);
    }

    if (!value) return;

    startCheckingCustomDate(async () => {
      try {
        const info = await getDayRouteInfo(
          suggestion.coordinates,
          {
            type: requestedTime.type,
            specificTime:
              requestedTime.type === "specific" ? requestedTime.specificTime : undefined,
          },
          value,
          jobId,
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
    const fromAllDays = suggestion.allDays.find((d) => d.date === selectedDate);
    if (fromAllDays) return fromAllDays;
    if (currentDateInfo && currentDateInfo.date === selectedDate) return currentDateInfo;
    if (customDateInfo && customDateInfo.date === selectedDate) return customDateInfo;
    return undefined;
  }

  function getFinalTimeSelection(): TimeSelection {
    const suggested = selectedDayTimeSuggestion;
    if (acceptTimeSuggestion && suggested?.fits && suggested.slot) {
      return { type: suggested.slot, specificTime: suggested.specificTime };
    }
    return {
      type: requestedTime.type,
      specificTime: requestedTime.type === "specific" ? requestedTime.specificTime : null,
    };
  }

  function handleConfirmClick() {
    if (!selectedDate) return;

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

    onConfirm(selectedDate, getFinalTimeSelection());
  }

  // Only offer the accept/override choice for a time that actually fits —
  // there's nothing to accept otherwise.
  const timeSuggestionApplies = !!selectedDayTimeSuggestion?.fits;
  // What will actually be saved. For a named slot or a specific time this
  // is simply the time the job already had, carried across — worth saying
  // out loud rather than leaving the user to infer it from elsewhere.
  const finalTimeLabel =
    acceptTimeSuggestion && selectedDayTimeSuggestion?.fits && selectedDayTimeSuggestion.label
      ? selectedDayTimeSuggestion.label
      : requestedTimeLabel;
  const warningComparison = warningDay ? distanceComparisonLabel(warningDay) : null;

  // The surface takes its tone from what the engine concluded, so a
  // clustered or no-fit answer never wears the confident teal of a real
  // recommendation.
  const tone = (() => {
    if (isUsingCustomDate) return { className: "suggest", label: "Your date" };
    if (isUsingCurrentDate) return { className: "suggest", label: "Unchanged" };
    if (!isEnginePick) return { className: "suggest", label: "Next best" };
    switch (suggestion.suggestion.kind) {
      case "clustered":
        return { className: "suggest suggest--accent", label: "Groups with a nearby job" };
      case "none":
        return { className: "suggest suggest--warn", label: "No great fit" };
      default:
        return { className: "suggest", label: "Suggested" };
    }
  })();

  const shownDay = isUsingCustomDate
    ? customDateInfo
    : isUsingCurrentDate
      ? resolvedCurrentDateInfo
      : activeCandidate;

  return (
    <div className={tone.className} style={{ marginTop: 0 }}>
      <div className="suggest-label">{tone.label}</div>
      <div className="suggest-headline">
        {formatSuggestionDate(selectedDate)}
        {finalTimeLabel ? ` · ${finalTimeLabel}` : ""}
      </div>

      {shownDay && (
        <div className="suggest-meta">
          {dayDetailLine(shownDay, unit)}
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

      {timeSuggestionApplies && selectedDayTimeSuggestion && (
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
            Keep {requestedTimeLabel}
          </button>
        </div>
      )}

      <div className="suggest-actions">
        {currentDate && !isUsingCurrentDate && (
          <button
            type="button"
            className="btn btn--outline btn--block btn--sm"
            onClick={() => selectDay(currentDate)}
          >
            Keep {formatSuggestionDate(currentDate)}
          </button>
        )}

        {activeCandidate && selectedDate !== activeCandidate.date && (
          <button
            type="button"
            className="btn btn--outline btn--block btn--sm"
            onClick={() => {
              resetCustomDateState();
              selectDay(activeCandidate.date);
            }}
          >
            Move to {formatSuggestionDate(activeCandidate.date)}
          </button>
        )}

        {activeCandidate &&
          (hasMoreCandidates ? (
            <button
              type="button"
              className="btn btn--outline btn--block btn--sm"
              onClick={handleTryNextBest}
            >
              Not free that day? Try next best
            </button>
          ) : (
            <p className="suggest-meta">
              That&apos;s every day this week — pick your own date below.
            </p>
          ))}

        <div>
          <label className="field-label">Different date</label>
          <div className="input-wrap">
            <input
              className="input"
              type="date"
              min={getTodayDateString()}
              value={customDate}
              onChange={(e) => handleCustomDateChange(e.target.value)}
            />
            {!customDate && <span className="input-placeholder">Select a date</span>}
          </div>
        </div>

        {timeControl && <div>{timeControl}</div>}
      </div>

      {warningDay && (
        <div className="warn-block">
          {warningDay.addedDistanceKm > suggestion.maxTravelRangeKm && (
            <p>
              This adds {formatDistance(warningDay.addedDistanceKm, unit)} of extra driving on{" "}
              {warningDay.date}
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
              {Math.round(warningDay.timeFeasibility.previousGapMinutes ?? 0)} minutes apart.
            </p>
          )}
          {warningDay.timeFeasibility?.nextConflict && (
            <p>
              This job takes about {durationMinutes ?? ASSUMED_JOB_DURATION_MINUTES} minutes,
              plus roughly a{" "}
              {Math.round(warningDay.timeFeasibility.nextTravelMinutes ?? 0)}-minute drive to
              your next job that day — but they&apos;re only booked{" "}
              {Math.round(warningDay.timeFeasibility.nextGapMinutes ?? 0)} minutes apart.
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
            onClick={() => onConfirm(selectedDate, getFinalTimeSelection())}
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
          style={{ marginTop: 14 }}
          onClick={handleConfirmClick}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Confirm & Save"}
        </button>
      )}
    </div>
  );
}
