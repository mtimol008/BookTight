// Shared validation for the "business rules" fields (working hours, max
// travel range, max jobs per day) — used by both the Account edit screen
// and onboarding, which both write the same profile columns and must
// enforce the same rules the DB check constraints already enforce.

import type { DistanceUnit } from "./format";
import {
  DEFAULT_SCHEDULING_PREFERENCES,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  minutesToTimeValue,
  type Weekday,
} from "./scheduling";

const MILES_PER_KILOMETER = 0.621371;

export type WorkingHoursInput = Record<
  Weekday,
  { enabled: boolean; start: string; end: string }
>;

export interface BusinessRulesInput {
  workingHours: WorkingHoursInput;
  distanceUnit: DistanceUnit;
  maxTravelRangeKm: number;
  maxJobsPerDay: number | null;
}

function distanceUnitFromRaw(raw: string | null): DistanceUnit {
  if (raw === "mi") {
    return "mi";
  }
  return "km";
}

/** Reads one day's `${day}-enabled` / `${day}-start` / `${day}-end` fields
 *  — FormData can't nest, so this flat naming convention is what
 *  WorkingHoursFields submits. */
function readDayHours(
  formData: FormData,
  day: Weekday
): { error: string } | { value: { enabled: boolean; start: string; end: string } } {
  const enabled = formData.get(`${day}-enabled`) !== null;
  const start = formData.get(`${day}-start`)?.toString() ?? "";
  const end = formData.get(`${day}-end`)?.toString() ?? "";

  if (!enabled) {
    // Hours are still stored (so re-enabling later has something sensible
    // to show), just not validated — an off day's hours don't matter. The
    // client always submits the day's real current value even while it's
    // disabled (see WorkingHoursFields' hidden mirror inputs), so start/end
    // being blank here should only happen for a genuinely missing value —
    // fall back to the app's own actual default rather than an arbitrary
    // literal that doesn't match it.
    const fallback = DEFAULT_SCHEDULING_PREFERENCES.workingHours[day];
    return {
      value: {
        enabled: false,
        start: start || minutesToTimeValue(fallback.startMinutes),
        end: end || minutesToTimeValue(fallback.endMinutes),
      },
    };
  }

  if (!start || !end) {
    return { error: `${WEEKDAY_LABELS[day]} needs a start and end time, or turn it off.` };
  }

  // Mirrors the DB check constraint — catching an obviously bad value here
  // means it never round-trips to the server for the common case.
  if (end <= start) {
    return { error: `${WEEKDAY_LABELS[day]}'s end time must be after its start time.` };
  }

  return { value: { enabled: true, start, end } };
}

export function validateBusinessRules(
  formData: FormData
): { error: string } | { value: BusinessRulesInput } {
  const workingHours = {} as WorkingHoursInput;
  let anyEnabled = false;

  for (const day of WEEKDAY_KEYS) {
    const result = readDayHours(formData, day);
    if ("error" in result) {
      return result;
    }
    workingHours[day] = result.value;
    if (result.value.enabled) {
      anyEnabled = true;
    }
  }

  if (!anyEnabled) {
    return { error: "At least one day needs to be turned on." };
  }

  const distanceUnit = distanceUnitFromRaw(
    formData.get("distanceUnit")?.toString() ?? null
  );
  const maxTravelRangeRaw = formData.get("maxTravelRangeKm")?.toString().trim() ?? "";
  const maxJobsPerDayRaw = formData.get("maxJobsPerDay")?.toString().trim() ?? "";

  if (!maxTravelRangeRaw) {
    return { error: "Max travel range is required." };
  }

  const maxTravelRange = Number(maxTravelRangeRaw);
  if (!Number.isFinite(maxTravelRange) || maxTravelRange <= 0) {
    return { error: "Max travel range must be a positive number." };
  }

  const rawMaxTravelRangeKm =
    distanceUnit === "mi" ? maxTravelRange / MILES_PER_KILOMETER : maxTravelRange;
  // Rounded to one decimal place of km, not a whole km — a whole-km grid
  // (~0.62 mi per step) can't represent a value entered to 0.1 mi
  // precision, which is what silently turned "25.0 mi" into "24.9 mi" on
  // redisplay. One decimal km is fine enough that a value entered to 0.1
  // mi/km round-trips back to the same displayed number.
  const maxTravelRangeKm = Math.round(rawMaxTravelRangeKm * 10) / 10;

  if (maxTravelRangeKm <= 0) {
    return { error: "Max travel range must be a positive number." };
  }

  let maxJobsPerDay: number | null = null;
  if (maxJobsPerDayRaw) {
    maxJobsPerDay = Number(maxJobsPerDayRaw);
    if (!Number.isInteger(maxJobsPerDay) || maxJobsPerDay <= 0) {
      return {
        error:
          "Max jobs per day must be a positive whole number, or left blank for no cap.",
      };
    }
  }

  return {
    value: {
      workingHours,
      distanceUnit,
      maxTravelRangeKm,
      maxJobsPerDay,
    },
  };
}
