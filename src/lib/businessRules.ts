// Shared validation for the "business rules" fields (working hours, max
// travel range, max jobs per day) — used by both the Account edit screen
// and onboarding, which both write the same four profile columns and must
// enforce the same rules the DB check constraints already enforce.

export interface BusinessRulesInput {
  workingHoursStart: string;
  workingHoursEnd: string;
  maxTravelRangeKm: number;
  maxJobsPerDay: number | null;
}

export function validateBusinessRules(
  formData: FormData
): { error: string } | { value: BusinessRulesInput } {
  const workingHoursStart = formData.get("workingHoursStart")?.toString() ?? "";
  const workingHoursEnd = formData.get("workingHoursEnd")?.toString() ?? "";
  const maxTravelRangeKmRaw = formData.get("maxTravelRangeKm")?.toString().trim() ?? "";
  const maxJobsPerDayRaw = formData.get("maxJobsPerDay")?.toString().trim() ?? "";

  if (!workingHoursStart || !workingHoursEnd || !maxTravelRangeKmRaw) {
    return { error: "Working hours and max travel range are all required." };
  }

  // Mirrors the DB check constraints — catching an obviously bad value
  // here means it never round-trips to the server for the common case.
  if (workingHoursEnd <= workingHoursStart) {
    return { error: "Working hours end must be after the start." };
  }

  const maxTravelRangeKm = Number(maxTravelRangeKmRaw);
  if (!Number.isFinite(maxTravelRangeKm) || maxTravelRangeKm <= 0) {
    return { error: "Max travel range must be a positive number." };
  }

  let maxJobsPerDay: number | null = null;
  if (maxJobsPerDayRaw) {
    maxJobsPerDay = Number(maxJobsPerDayRaw);
    if (!Number.isInteger(maxJobsPerDay) || maxJobsPerDay <= 0) {
      return { error: "Max jobs per day must be a positive whole number, or left blank for no cap." };
    }
  }

  return { value: { workingHoursStart, workingHoursEnd, maxTravelRangeKm, maxJobsPerDay } };
}
