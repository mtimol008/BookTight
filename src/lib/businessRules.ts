// Shared validation for the "business rules" fields (working hours, max
// travel range, max jobs per day) — used by both the Account edit screen
// and onboarding, which both write the same four profile columns and must
// enforce the same rules the DB check constraints already enforce.

import type { DistanceUnit } from "./format";

const MILES_PER_KILOMETER = 0.621371;

export interface BusinessRulesInput {
  workingHoursStart: string;
  workingHoursEnd: string;
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

export function validateBusinessRules(
  formData: FormData
): { error: string } | { value: BusinessRulesInput } {
  const workingHoursStart = formData.get("workingHoursStart")?.toString() ?? "";
  const workingHoursEnd = formData.get("workingHoursEnd")?.toString() ?? "";
  const distanceUnit = distanceUnitFromRaw(
    formData.get("distanceUnit")?.toString() ?? null
  );
  const maxTravelRangeRaw = formData.get("maxTravelRangeKm")?.toString().trim() ?? "";
  const maxJobsPerDayRaw = formData.get("maxJobsPerDay")?.toString().trim() ?? "";

  if (!workingHoursStart || !workingHoursEnd || !maxTravelRangeRaw) {
    return { error: "Working hours and max travel range are all required." };
  }

  // Mirrors the DB check constraints — catching an obviously bad value
  // here means it never round-trips to the server for the common case.
  if (workingHoursEnd <= workingHoursStart) {
    return { error: "Working hours end must be after the start." };
  }

  const maxTravelRange = Number(maxTravelRangeRaw);
  if (!Number.isFinite(maxTravelRange) || maxTravelRange <= 0) {
    return { error: "Max travel range must be a positive number." };
  }

  const maxTravelRangeKm = Math.round(
    distanceUnit === "mi" ? maxTravelRange / MILES_PER_KILOMETER : maxTravelRange
  );

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
      workingHoursStart,
      workingHoursEnd,
      distanceUnit,
      maxTravelRangeKm,
      maxJobsPerDay,
    },
  };
}
