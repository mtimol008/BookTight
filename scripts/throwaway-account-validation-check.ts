// THROWAWAY — not part of the test suite. Exercises the same validation
// checks that live in src/app/account/actions.ts (working hours, max travel
// range, max jobs per day) against edge-case inputs, without touching
// Supabase/auth/geocoding. Run with: npx tsx scripts/throwaway-account-validation-check.ts
// Delete this file when done — it's scaffolding to sanity-check the account
// form's validation logic without a browser.

interface Case {
  label: string;
  homeAddress: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  maxTravelRangeKmRaw: string;
  maxJobsPerDayRaw: string;
  expectError: string | null; // null = expect it to pass validation
}

function validate(c: Case): string | null {
  const { homeAddress, workingHoursStart, workingHoursEnd, maxTravelRangeKmRaw, maxJobsPerDayRaw } = c;

  if (!homeAddress || !workingHoursStart || !workingHoursEnd || !maxTravelRangeKmRaw) {
    return "Home address, working hours, and max travel range are all required.";
  }

  if (workingHoursEnd <= workingHoursStart) {
    return "Working hours end must be after the start.";
  }

  const maxTravelRangeKm = Number(maxTravelRangeKmRaw);
  if (!Number.isFinite(maxTravelRangeKm) || maxTravelRangeKm <= 0) {
    return "Max travel range must be a positive number.";
  }

  if (maxJobsPerDayRaw) {
    const maxJobsPerDay = Number(maxJobsPerDayRaw);
    if (!Number.isInteger(maxJobsPerDay) || maxJobsPerDay <= 0) {
      return "Max jobs per day must be a positive whole number, or left blank for no cap.";
    }
  }

  return null;
}

const cases: Case[] = [
  {
    label: "equal start/end times (exact boundary)",
    homeAddress: "1 Main St", workingHoursStart: "09:00", workingHoursEnd: "09:00",
    maxTravelRangeKmRaw: "50", maxJobsPerDayRaw: "",
    expectError: "Working hours end must be after the start.",
  },
  {
    label: "end one minute before start",
    homeAddress: "1 Main St", workingHoursStart: "09:01", workingHoursEnd: "09:00",
    maxTravelRangeKmRaw: "50", maxJobsPerDayRaw: "",
    expectError: "Working hours end must be after the start.",
  },
  {
    label: "valid normal range",
    homeAddress: "1 Main St", workingHoursStart: "08:00", workingHoursEnd: "18:00",
    maxTravelRangeKmRaw: "50", maxJobsPerDayRaw: "",
    expectError: null,
  },
  {
    label: "max travel range = 0",
    homeAddress: "1 Main St", workingHoursStart: "08:00", workingHoursEnd: "18:00",
    maxTravelRangeKmRaw: "0", maxJobsPerDayRaw: "",
    expectError: "Max travel range must be a positive number.",
  },
  {
    label: "max travel range negative",
    homeAddress: "1 Main St", workingHoursStart: "08:00", workingHoursEnd: "18:00",
    maxTravelRangeKmRaw: "-5", maxJobsPerDayRaw: "",
    expectError: "Max travel range must be a positive number.",
  },
  {
    label: "max travel range non-numeric",
    homeAddress: "1 Main St", workingHoursStart: "08:00", workingHoursEnd: "18:00",
    maxTravelRangeKmRaw: "abc", maxJobsPerDayRaw: "",
    expectError: "Max travel range must be a positive number.",
  },
  {
    label: "max jobs per day blank (no cap, should pass)",
    homeAddress: "1 Main St", workingHoursStart: "08:00", workingHoursEnd: "18:00",
    maxTravelRangeKmRaw: "50", maxJobsPerDayRaw: "",
    expectError: null,
  },
  {
    label: "max jobs per day = 0",
    homeAddress: "1 Main St", workingHoursStart: "08:00", workingHoursEnd: "18:00",
    maxTravelRangeKmRaw: "50", maxJobsPerDayRaw: "0",
    expectError: "Max jobs per day must be a positive whole number, or left blank for no cap.",
  },
  {
    label: "max jobs per day decimal",
    homeAddress: "1 Main St", workingHoursStart: "08:00", workingHoursEnd: "18:00",
    maxTravelRangeKmRaw: "50", maxJobsPerDayRaw: "2.5",
    expectError: "Max jobs per day must be a positive whole number, or left blank for no cap.",
  },
  {
    label: "max jobs per day negative",
    homeAddress: "1 Main St", workingHoursStart: "08:00", workingHoursEnd: "18:00",
    maxTravelRangeKmRaw: "50", maxJobsPerDayRaw: "-3",
    expectError: "Max jobs per day must be a positive whole number, or left blank for no cap.",
  },
  {
    label: "home address blank",
    homeAddress: "", workingHoursStart: "08:00", workingHoursEnd: "18:00",
    maxTravelRangeKmRaw: "50", maxJobsPerDayRaw: "",
    expectError: "Home address, working hours, and max travel range are all required.",
  },
];

let failures = 0;
for (const c of cases) {
  const actual = validate(c);
  const pass = actual === c.expectError;
  console.log(`${pass ? "PASS" : "FAIL"}: ${c.label} -> ${actual ?? "(no error)"}`);
  if (!pass) {
    console.error(`  expected: ${c.expectError ?? "(no error)"}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} validation cases passed.`);
