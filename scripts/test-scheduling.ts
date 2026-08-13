// Manual sanity check for src/lib/scheduling.ts using hardcoded coordinates.
// Run with: npm run test:scheduling

import {
  compareManualOrder,
  planDayRoute,
  suggestBestDay,
  DEFAULT_SCHEDULING_PREFERENCES,
  WEEKDAY_KEYS,
  type DayRoute,
  type DayTimeOption,
  type ExistingJob,
  type JobTime,
  type NamedTimeSlot,
  type SchedulingPreferences,
} from "../src/lib/scheduling";

function withPrefs(overrides: Partial<SchedulingPreferences>): SchedulingPreferences {
  return { ...DEFAULT_SCHEDULING_PREFERENCES, ...overrides };
}

/** All 7 days enabled at the same start/end — the per-day equivalent of the
 *  old flat workdayStartMinutes/workdayEndMinutes override, for scenarios
 *  testing the working-hours window itself rather than which days are on. */
function withUniformWorkingHours(startMinutes: number, endMinutes: number): SchedulingPreferences {
  const workingHours = {} as SchedulingPreferences["workingHours"];
  for (const day of WEEKDAY_KEYS) {
    workingHours[day] = { enabled: true, startMinutes, endMinutes };
  }
  return { ...DEFAULT_SCHEDULING_PREFERENCES, workingHours };
}

/** Every flexible-job scenario has a timeOption; fail loudly if not. */
function timeOptionOf(day: DayRoute): DayTimeOption {
  if (!day.timeOption) {
    console.error("FAIL: expected a timeOption on this day, got null");
    process.exit(1);
  }
  return day.timeOption;
}

function expectKind(label: string, actual: string, expected: string): void {
  if (actual === expected) {
    console.log(`PASS: ${label} -> kind "${expected}" as expected.`);
  } else {
    console.error(`FAIL: ${label} -> expected kind "${expected}", got "${actual}"`);
    process.exit(1);
  }
}

function expectClose(label: string, actual: number, expected: number, tolerance = 0.05): void {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`PASS: ${label} -> ${actual.toFixed(4)} (expected ~${expected}).`);
  } else {
    console.error(`FAIL: ${label} -> expected ~${expected}, got ${actual}`);
    process.exit(1);
  }
}

function expectTrue(label: string, condition: boolean): void {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
}

const NONE: JobTime = { type: "none" };

// --- Scenario 1: recommended ---------------------------------------------
{
  const home = { latitude: 30.4, longitude: -97.72 };
  const existingJobs: ExistingJob[] = [
    { id: "mon-1", date: "2026-08-10", latitude: 30.42, longitude: -97.722, time: NONE, durationMinutes: null, manualPosition: null },
    { id: "mon-2", date: "2026-08-10", latitude: 30.425, longitude: -97.718, time: NONE, durationMinutes: null, manualPosition: null },
    { id: "tue-1", date: "2026-08-11", latitude: 30.2, longitude: -97.79, time: NONE, durationMinutes: null, manualPosition: null },
    { id: "tue-2", date: "2026-08-11", latitude: 30.21, longitude: -97.8, time: NONE, durationMinutes: null, manualPosition: null },
    { id: "wed-1", date: "2026-08-12", latitude: 30.27, longitude: -97.7, time: NONE, durationMinutes: null, manualPosition: null },
  ];
  const candidateDates = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"];
  const newJob = { latitude: 30.415, longitude: -97.715 };

  const result = suggestBestDay(newJob, NONE, home, candidateDates, existingJobs);
  if (!result) {
    console.error("FAIL: scenario 1 expected a result, got null");
    process.exit(1);
  }
  expectKind("scenario 1 (recommended)", result.suggestion.kind, "recommended");
  expectTrue("scenario 1 suggested Monday", result.suggestion.day.date === "2026-08-10");
}

// --- Scenario 2: clustered -------------------------------------------------
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.045, longitude: -96.605 };
  const existingJobs: ExistingJob[] = [
    { id: "e", date: "2026-08-10", latitude: 30.045, longitude: -97.0, time: NONE, durationMinutes: null, manualPosition: null },
  ];
  const candidateDates = ["2026-08-10", "2026-08-11"];

  const result = suggestBestDay(newJob, NONE, home, candidateDates, existingJobs);
  if (!result) {
    console.error("FAIL: scenario 2 expected a result, got null");
    process.exit(1);
  }
  expectKind("scenario 2 (clustered)", result.suggestion.kind, "clustered");
  expectTrue("scenario 2 clustered onto 2026-08-10", result.suggestion.day.date === "2026-08-10");
}

// --- Scenario 3: none -------------------------------------------------------
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 31.0, longitude: -97.5 };
  const existingJobs: ExistingJob[] = [
    { id: "e", date: "2026-08-10", latitude: 30.045, longitude: -97.0, time: NONE, durationMinutes: null, manualPosition: null },
  ];
  const candidateDates = ["2026-08-10", "2026-08-11"];

  const result = suggestBestDay(newJob, NONE, home, candidateDates, existingJobs);
  if (!result) {
    console.error("FAIL: scenario 3 expected a result, got null");
    process.exit(1);
  }
  expectKind("scenario 3 (none)", result.suggestion.kind, "none");
}

// --- Scenario 4: chronological ordering -----------------------------------
// Job A is close to home but booked LATE (15:00). Job B is further but
// booked EARLY (9:00). Job C is closest but booked MIDDLE (12:00). Time
// order (B, C, A) differs from nearest-neighbor-by-distance order. A
// zero-impact "new job" placed exactly at home (costs 0 to insert) lets us
// read the pure existing-route total off totalDistanceKm — confirming it
// follows time order (~23.89km), not the geographically-greedy order
// (~21.0km, hand-verified separately during scenario design).
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "A", date: "2026-08-10", latitude: 30.05, longitude: -97.0, time: { type: "specific", specificTime: "15:00" }, durationMinutes: null, manualPosition: null },
    { id: "B", date: "2026-08-10", latitude: 30.0, longitude: -97.05, time: { type: "specific", specificTime: "09:00" }, durationMinutes: null, manualPosition: null },
    { id: "C", date: "2026-08-10", latitude: 29.97, longitude: -97.02, time: { type: "specific", specificTime: "12:00" }, durationMinutes: null, manualPosition: null },
  ];

  const result = suggestBestDay(home, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 4 expected a result, got null");
    process.exit(1);
  }
  expectClose(
    "scenario 4 chronological route total",
    result.allDays[0].totalDistanceKm,
    23.8895
  );
}

// --- Scenario 5: flexible job insertion -------------------------------------
// Fixed skeleton: P1 at home (9:00), P2 far away (15:00). Flexible job F
// sits essentially on top of P2 -> should get inserted right next to it,
// adding only a tiny amount over the skeleton-only total.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobsWithF: ExistingJob[] = [
    { id: "P1", date: "2026-08-10", latitude: 30.0, longitude: -97.0, time: { type: "specific", specificTime: "09:00" }, durationMinutes: null, manualPosition: null },
    { id: "P2", date: "2026-08-10", latitude: 30.1, longitude: -97.1, time: { type: "specific", specificTime: "15:00" }, durationMinutes: null, manualPosition: null },
    { id: "F", date: "2026-08-10", latitude: 30.1001, longitude: -97.1001, time: NONE, durationMinutes: null, manualPosition: null },
  ];
  const skeletonOnly = existingJobsWithF.filter((j) => j.id !== "F");

  const withF = suggestBestDay(home, NONE, home, ["2026-08-10"], existingJobsWithF);
  const skeleton = suggestBestDay(home, NONE, home, ["2026-08-10"], skeletonOnly);
  if (!withF || !skeleton) {
    console.error("FAIL: scenario 5 expected results, got null");
    process.exit(1);
  }

  const extra = withF.allDays[0].totalDistanceKm - skeleton.allDays[0].totalDistanceKm;
  expectTrue(
    "scenario 5 flexible job inserted cheaply next to its near-twin",
    extra > 0 && extra < 0.1
  );
}

// --- Scenario 6: time suggestion + reasoning data ---------------------------
// New job is "none" (flexible), geographically at the exact midpoint
// between two fixed existing jobs. Home is off to the side (not colinear)
// so "between the two jobs" is unambiguously the cheapest fit.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const jobMorning = { latitude: 30.5, longitude: -96.5 };
  const jobAfternoon = { latitude: 30.5, longitude: -96.0 };
  const newJob = { latitude: 30.5, longitude: -96.25 };

  const existingJobs: ExistingJob[] = [
    { id: "morning-job", date: "2026-08-10", ...jobMorning, time: { type: "specific", specificTime: "10:00" }, durationMinutes: null, manualPosition: null },
    { id: "afternoon-job", date: "2026-08-10", ...jobAfternoon, time: { type: "specific", specificTime: "16:00" }, durationMinutes: null, manualPosition: null },
  ];

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 6 expected a result, got null");
    process.exit(1);
  }
  const day = result.allDays[0];
  expectTrue("scenario 6 fits between morning and afternoon jobs", !day.previousNeighbor.isHome && !day.nextNeighbor.isHome);
  expectTrue("scenario 6 previous neighbor is the 10am job", day.previousNeighbor.jobId === "morning-job");
  expectTrue("scenario 6 next neighbor is the 4pm job", day.nextNeighbor.jobId === "afternoon-job");
  expectTrue("scenario 6 added distance is negligible (genuinely fits between)", day.addedDistanceKm < 0.01);
}

// --- Scenario 7: feasibility warning -----------------------------------------
// One existing job at 10:00, ~27km away (~40 min drive at the assumed
// 40km/h), duration left blank so it uses the flat 60-min default — the
// real threshold before the next job can start is duration + travel, ~100
// min. New job booked at 10:15 -> only a 15 min gap, should conflict.
// Booked at 12:15 -> 135 min gap, comfortably past that 100-min threshold,
// should not conflict.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "E", date: "2026-08-10", latitude: 30.24, longitude: -97.0, time: { type: "specific", specificTime: "10:00" }, durationMinutes: null, manualPosition: null },
  ];

  const tight = suggestBestDay(home, { type: "specific", specificTime: "10:15" }, home, ["2026-08-10"], existingJobs);
  const comfortable = suggestBestDay(home, { type: "specific", specificTime: "12:15" }, home, ["2026-08-10"], existingJobs);
  if (!tight || !comfortable) {
    console.error("FAIL: scenario 7 expected results, got null");
    process.exit(1);
  }

  expectTrue("scenario 7 tight gap flagged as a conflict", tight.allDays[0].timeFeasibility?.previousConflict === true);
  expectTrue("scenario 7 comfortable gap has no conflict", comfortable.allDays[0].timeFeasibility?.previousConflict === false);
}

// --- Scenario 8: tie-breaking for same-slot jobs ----------------------------
// Three "morning" jobs (identical anchor time -> a three-way tie) listed in
// the array in an order that does NOT match nearest-neighbor-from-home
// order, specifically chosen so the naive "keep array order" behavior
// produces a worse (~25.0km) total than correctly breaking the tie by
// proximity (~21.18km, home -> C -> B -> A -> home). A zero-impact new job
// at home reads the pure existing-route total off totalDistanceKm.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const morning: JobTime = { type: "morning" };
  // Deliberately listed as [B, A, C] — not nearest-neighbor order, and not
  // simply the reverse of it either (which would coincidentally match).
  const existingJobs: ExistingJob[] = [
    { id: "B", date: "2026-08-10", latitude: 30.0, longitude: -97.05, time: morning, durationMinutes: null, manualPosition: null },
    { id: "A", date: "2026-08-10", latitude: 30.05, longitude: -97.0, time: morning, durationMinutes: null, manualPosition: null },
    { id: "C", date: "2026-08-10", latitude: 29.97, longitude: -97.02, time: morning, durationMinutes: null, manualPosition: null },
  ];

  const result = suggestBestDay(home, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 8 expected a result, got null");
    process.exit(1);
  }
  expectClose(
    "scenario 8 tie-broken-by-proximity route total",
    result.allDays[0].totalDistanceKm,
    21.179
  );

  // Same-day neighbor check: the new job (also "none"/flexible, placed at
  // home) should show a named-slot neighbor's timeType as "morning", not
  // "specific" — the underlying data that feeds the reasoning-text fix.
  const neighborTimeType =
    result.allDays[0].previousNeighbor.timeType ?? result.allDays[0].nextNeighbor.timeType;
  expectTrue(
    "scenario 8 neighbor timeType correctly reports the named slot",
    neighborTimeType === "morning"
  );
}

// --- Scenario 9: ranking bias toward home (the reported bug) ---------------
// New job sits ~33km from home, roughly on the line out to a far existing
// job ("Preston", ~89km away, unrelated to the new job) on one day.
// Because the new job is nearly "on the way" to Preston, inserting it
// there is almost free (addedDistanceKm ~0) — but Preston has nothing to
// do with it (nearestExistingJobDistanceKm ~55.6km). A different day
// ("Manchester") has its own existing job genuinely close to the new one
// (~4.9km away) but a slightly higher addedDistanceKm (~3.5km, off the
// direct line from home). A plain addedDistanceKm sort would pick Preston
// (0 < 3.5) — reproducing the exact reported bug. The fix should pick
// Manchester instead.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.3, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "preston", date: "2026-08-03", latitude: 30.8, longitude: -97.0, time: NONE, durationMinutes: null, manualPosition: null },
    { id: "manchester-existing", date: "2026-08-06", latitude: 30.31, longitude: -97.05, time: NONE, durationMinutes: null, manualPosition: null },
  ];
  const candidateDates = ["2026-08-03", "2026-08-06"];

  const result = suggestBestDay(newJob, NONE, home, candidateDates, existingJobs);
  if (!result) {
    console.error("FAIL: scenario 9 expected a result, got null");
    process.exit(1);
  }

  const prestonDay = result.allDays.find((d) => d.date === "2026-08-03")!;
  const manchesterDay = result.allDays.find((d) => d.date === "2026-08-06")!;

  expectTrue(
    "scenario 9 confirms the bug would occur under a plain addedDistanceKm sort",
    prestonDay.addedDistanceKm < manchesterDay.addedDistanceKm
  );
  expectTrue(
    "scenario 9 fix picks the genuinely-nearby Manchester day, not the home-proximity artifact",
    result.suggestion.day.date === "2026-08-06"
  );
}

// --- Scenario 10: the reported bug — "fits between" without the time to --
// actually get there. Two fixed jobs only 75 minutes apart (10:15 and
// 11:30) but each ~260km from the new job — roughly a 6.5 hour drive each
// way at the assumed 40km/h. The old logic averaged the two clock times
// and confidently answered 10:53am; the fix must refuse to claim it fits.
{
  // Same geometry as scenario 6 (home off to the side, new job at the exact
  // midpoint so "between the two" is unambiguously the cheapest insertion)
  // but stretched out: 2.75 degrees of longitude at this latitude is ~264km,
  // so each leg is a ~6.5 hour drive.
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "far-morning", date: "2026-08-10", latitude: 30.5, longitude: -96.5, time: { type: "specific", specificTime: "10:15" }, durationMinutes: null, manualPosition: null },
    { id: "far-later", date: "2026-08-10", latitude: 30.5, longitude: -91.0, time: { type: "specific", specificTime: "11:30" }, durationMinutes: null, manualPosition: null },
  ];
  const newJob = { latitude: 30.5, longitude: -93.75 };

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 10 expected a result, got null");
    process.exit(1);
  }
  const day: DayRoute = result.allDays[0];
  const window = timeOptionOf(day);

  expectTrue("scenario 10 correctly refuses to claim it fits", window.fits === false);
  expectTrue(
    "scenario 10 reports a shortfall far larger than the 75 minute gap",
    (window.shortfallMinutes ?? 0) > 75
  );
  expectTrue(
    "scenario 10 offers no time at all when it doesn't fit",
    window.startMinutes === null && window.slot === null
  );
  expectTrue(
    "scenario 10 names the booked-up part of the day",
    window.blockedSlots.length > 0 && window.blockedSlots.includes("morning")
  );
}

// --- Scenario 11: genuinely tight but real -> an exact time ---------------
// Two fixed jobs 3 hours apart (10:00 and 13:00), each ~9.6km from the new
// job (~14 min drive). Feasible, but only just: roughly 11:14-11:46 once
// the hour of work and both drives are counted. That's well under the 2h
// threshold, so the answer should be an exact time, not a vague slot.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "before", date: "2026-08-10", latitude: 30.5, longitude: -96.5, time: { type: "specific", specificTime: "10:00" }, durationMinutes: null, manualPosition: null },
    { id: "after", date: "2026-08-10", latitude: 30.5, longitude: -96.3, time: { type: "specific", specificTime: "13:00" }, durationMinutes: null, manualPosition: null },
  ];
  const newJob = { latitude: 30.5, longitude: -96.4 };

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 11 expected a result, got null");
    process.exit(1);
  }
  const window = timeOptionOf(result.allDays[0]);

  expectTrue("scenario 11 fits", window.fits === true);
  expectTrue("scenario 11 gives an exact time, not a slot", window.startMinutes !== null && window.slot === null);
  expectTrue(
    "scenario 11 exact time lands inside the feasible window",
    window.startMinutes !== null &&
      window.startMinutes >= window.earliestStartMinutes &&
      window.startMinutes <= window.latestStartMinutes
  );
}

// --- Scenario 12: plenty of room -> a named slot (no false precision) -----
// Same shape as scenario 6: fixed jobs at 10:00 and 16:00, new job ~24km
// from each. Feasible with ~3 hours of slack, so naming an exact minute
// would be false precision — a named slot is the honest answer.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "am", date: "2026-08-10", latitude: 30.5, longitude: -96.5, time: { type: "specific", specificTime: "10:00" }, durationMinutes: null, manualPosition: null },
    { id: "pm", date: "2026-08-10", latitude: 30.5, longitude: -96.0, time: { type: "specific", specificTime: "16:00" }, durationMinutes: null, manualPosition: null },
  ];
  const newJob = { latitude: 30.5, longitude: -96.25 };

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 12 expected a result, got null");
    process.exit(1);
  }
  const window = timeOptionOf(result.allDays[0]);

  expectTrue("scenario 12 fits", window.fits === true);
  expectTrue(
    "scenario 12 gives a named slot, not false precision",
    window.slot !== null && window.startMinutes === null
  );
}

// --- Scenario 13: named-slot neighbors stay soft --------------------------
// A neighbor booked "morning" has a 9am sort-key ANCHOR the user never
// actually chose. Treating that anchor as a hard deadline would invent
// conflicts, so a named-slot neighbor must constrain by its whole range.
// Here both neighbors are named slots ~24km away — plenty of room, so this
// must NOT be reported as infeasible.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "am", date: "2026-08-10", latitude: 30.5, longitude: -96.5, time: { type: "morning" }, durationMinutes: null, manualPosition: null },
    { id: "pm", date: "2026-08-10", latitude: 30.5, longitude: -96.0, time: { type: "afternoon" }, durationMinutes: null, manualPosition: null },
  ];
  const newJob = { latitude: 30.5, longitude: -96.25 };

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 13 expected a result, got null");
    process.exit(1);
  }
  const window = timeOptionOf(result.allDays[0]);

  expectTrue("scenario 13 named-slot anchors don't invent a conflict", window.fits === true);
  expectTrue(
    "scenario 13 soft anchors leave a wide window, so a named slot",
    window.slot !== null && window.startMinutes === null
  );
}

// --- Scenario 14: the reported bug — one closed gap is not the whole day --
// The new address sits right on top of a 10:00/10:15 pair, so
// cheapest-insertion picks THAT gap by distance (~0 km detour) and it's
// impossible in time. The old code checked only that gap and reported the
// whole day unbookable. The morning before it is wide open, and that's what
// should come back.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "A", date: "2026-08-10", latitude: 30.20, longitude: -97.00, time: { type: "specific", specificTime: "10:00" }, durationMinutes: null, manualPosition: null },
    { id: "B", date: "2026-08-10", latitude: 30.21, longitude: -97.01, time: { type: "specific", specificTime: "10:15" }, durationMinutes: null, manualPosition: null },
    { id: "C", date: "2026-08-10", latitude: 30.60, longitude: -96.60, time: { type: "specific", specificTime: "11:30" }, durationMinutes: null, manualPosition: null },
    { id: "D", date: "2026-08-10", latitude: 30.55, longitude: -96.70, time: { type: "specific", specificTime: "15:00" }, durationMinutes: null, manualPosition: null },
  ];
  const newJob = { latitude: 30.205, longitude: -97.005 };

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 14 expected a result, got null");
    process.exit(1);
  }
  const day = result.allDays[0];
  const window = timeOptionOf(day);

  // Guard the premise: A and B really are the nearest jobs by distance, so
  // the geometrically cheapest gap genuinely is the impossible one.
  expectTrue(
    "scenario 14 the new job really is closest to the 10:00/10:15 pair",
    day.nearestExistingJobId === "A" || day.nearestExistingJobId === "B"
  );
  expectTrue("scenario 14 finds a workable slot instead of writing off the day", window.fits === true);
  expectTrue(
    "scenario 14 uses the open morning before the first job, not the closed A->B gap",
    window.previousNeighbor.isHome && window.nextNeighbor.jobId === "A"
  );
  expectTrue(
    "scenario 14 the chosen slot is genuinely feasible",
    window.earliestStartMinutes <= window.latestStartMinutes
  );
  expectTrue(
    "scenario 14 day distance reports the gap actually offered, not the impossible one",
    day.addedDistanceKm > 0.5 && day.addedDistanceKm < 5
  );
}

// --- Scenario 15: among feasible gaps, the smallest detour wins -----------
// Two fixed jobs far apart in time, both reachable. Slotting in beside the
// morning job is a much shorter detour than beside the afternoon one, so
// that gap must win even though both fit.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "near-am", date: "2026-08-10", latitude: 30.10, longitude: -97.0, time: { type: "specific", specificTime: "09:00" }, durationMinutes: null, manualPosition: null },
    { id: "far-pm", date: "2026-08-10", latitude: 30.90, longitude: -97.0, time: { type: "specific", specificTime: "15:00" }, durationMinutes: null, manualPosition: null },
  ];
  // Sits just past the morning job, nowhere near the afternoon one.
  const newJob = { latitude: 30.12, longitude: -97.0 };

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 15 expected a result, got null");
    process.exit(1);
  }
  const window = timeOptionOf(result.allDays[0]);

  expectTrue("scenario 15 fits", window.fits === true);
  expectTrue(
    "scenario 15 picks the gap beside the nearby morning job",
    window.previousNeighbor.jobId === "near-am"
  );
  expectTrue(
    "scenario 15 the winning gap really is the cheap one",
    result.allDays[0].addedDistanceKm < 10
  );
}

// --- Scenario 16: a genuinely full day, reported honestly -----------------
// Same impossible geometry as scenario 10 but with jobs spread across the
// morning AND afternoon, so the failure message can name both rather than
// citing one pair of jobs.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "am", date: "2026-08-10", latitude: 30.5, longitude: -96.5, time: { type: "specific", specificTime: "10:15" }, durationMinutes: null, manualPosition: null },
    { id: "pm", date: "2026-08-10", latitude: 30.5, longitude: -91.0, time: { type: "specific", specificTime: "14:00" }, durationMinutes: null, manualPosition: null },
  ];
  const newJob = { latitude: 30.5, longitude: -93.75 };

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 16 expected a result, got null");
    process.exit(1);
  }
  const window = timeOptionOf(result.allDays[0]);

  expectTrue("scenario 16 correctly reports the whole day as unworkable", window.fits === false);
  expectTrue(
    "scenario 16 names both booked-up parts of the day",
    window.blockedSlots.includes("morning") && window.blockedSlots.includes("afternoon")
  );
}

// --- Scenario 17: unbookable days rank below bookable ones ----------------
// Monday is a shorter drive but has no workable gap at all; Tuesday costs
// more driving but can actually take the job. Tuesday must win, and Monday
// must still appear in the list so "try next best" can explain it.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.2, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    // Monday: two jobs ~200km away, back to back. The new job sits exactly
    // on the line out to them, so inserting it is free by distance — but
    // every gap is impossible once the drives are counted.
    { id: "mon-1", date: "2026-08-10", latitude: 32.0, longitude: -97.0, time: { type: "specific", specificTime: "10:00" }, durationMinutes: null, manualPosition: null },
    { id: "mon-2", date: "2026-08-10", latitude: 32.2, longitude: -97.0, time: { type: "specific", specificTime: "10:30" }, durationMinutes: null, manualPosition: null },
    // Tuesday: one nearby job with room around it, but slightly off the
    // direct line, so it costs a little more driving.
    { id: "tue", date: "2026-08-11", latitude: 30.25, longitude: -96.9, time: { type: "specific", specificTime: "13:00" }, durationMinutes: null, manualPosition: null },
  ];

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10", "2026-08-11"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 17 expected a result, got null");
    process.exit(1);
  }
  const monday = result.allDays.find((d) => d.date === "2026-08-10")!;
  const tuesday = result.allDays.find((d) => d.date === "2026-08-11")!;

  expectTrue("scenario 17 Monday has no workable gap", timeOptionOf(monday).fits === false);
  expectTrue("scenario 17 Tuesday does have one", timeOptionOf(tuesday).fits === true);
  expectTrue(
    "scenario 17 confirms Monday would win on distance alone",
    monday.addedDistanceKm < tuesday.addedDistanceKm
  );
  expectTrue(
    "scenario 17 the bookable day is suggested anyway",
    result.suggestion.day.date === "2026-08-11"
  );
  expectTrue(
    "scenario 17 the unbookable day is ranked last, not hidden",
    result.allDays.length === 2 && result.allDays[1].date === "2026-08-10"
  );
}

// --- Scenario 18: the visible route order matches the computed one --------
// Reuses scenario 8's fixture: three "Morning" jobs with an identical sort
// key, listed as [B, A, C]. That's exactly the reported complaint — same
// named slot, so the table showed them in arbitrary order. planDayRoute
// must surface the real proximity-broken order (C, B, A) and legs that add
// up to the same 21.179km scenario 8 already pins.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const morning: JobTime = { type: "morning" };
  const jobs: ExistingJob[] = [
    { id: "B", date: "2026-08-10", latitude: 30.0, longitude: -97.05, time: morning, durationMinutes: null, manualPosition: null },
    { id: "A", date: "2026-08-10", latitude: 30.05, longitude: -97.0, time: morning, durationMinutes: null, manualPosition: null },
    { id: "C", date: "2026-08-10", latitude: 29.97, longitude: -97.02, time: morning, durationMinutes: null, manualPosition: null },
  ];

  const route = planDayRoute(home, jobs);

  expectTrue(
    "scenario 18 surfaces the real visit order, not the array order",
    route.stops.map((s) => s.jobId).join(",") === "C,B,A"
  );
  expectClose(
    "scenario 18 legs plus the trip home equal the day total",
    route.stops[route.stops.length - 1].cumulativeDistanceKm + route.returnHomeKm,
    route.totalDistanceKm
  );
  expectClose(
    "scenario 18 day total matches the figure scenario 8 pins",
    route.totalDistanceKm,
    21.179
  );
  expectTrue(
    "scenario 18 cumulative distance only ever grows",
    route.stops.every(
      (stop, i) =>
        i === 0 || stop.cumulativeDistanceKm > route.stops[i - 1].cumulativeDistanceKm
    )
  );

  const emptyRoute = planDayRoute(home, []);
  expectTrue(
    "scenario 18 a day with no jobs has no stops and no trip home",
    emptyRoute.stops.length === 0 &&
      emptyRoute.returnHomeKm === 0 &&
      emptyRoute.totalDistanceKm === 0
  );
}

// --- Scenario 19: named slots get checked against their own hours ---------
// A day whose afternoon is packed back-to-back (12:30, 13:30, 14:30, 15:30,
// 16:30 — an hour apart, and a job is assumed to take an hour, so no gap
// between them can take another) but whose morning is completely free.
// Everything sits within a few km, so distance never rules anything out —
// the ONLY thing that can distinguish these cases is the requested slot.
//
// Previously named slots skipped feasibility entirely, so an "afternoon"
// job was dropped onto a day like this without a word.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.02, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "pm1", date: "2026-08-10", latitude: 30.03, longitude: -97.0, time: { type: "specific", specificTime: "12:30" }, durationMinutes: null, manualPosition: null },
    { id: "pm2", date: "2026-08-10", latitude: 30.04, longitude: -97.0, time: { type: "specific", specificTime: "13:30" }, durationMinutes: null, manualPosition: null },
    { id: "pm3", date: "2026-08-10", latitude: 30.05, longitude: -97.0, time: { type: "specific", specificTime: "14:30" }, durationMinutes: null, manualPosition: null },
    { id: "pm4", date: "2026-08-10", latitude: 30.06, longitude: -97.0, time: { type: "specific", specificTime: "15:30" }, durationMinutes: null, manualPosition: null },
    { id: "pm5", date: "2026-08-10", latitude: 30.07, longitude: -97.0, time: { type: "specific", specificTime: "16:30" }, durationMinutes: null, manualPosition: null },
  ];

  const asAfternoon = suggestBestDay(
    newJob, { type: "afternoon" }, home, ["2026-08-10"], existingJobs
  );
  const asMorning = suggestBestDay(
    newJob, { type: "morning" }, home, ["2026-08-10"], existingJobs
  );
  const asFlexible = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!asAfternoon || !asMorning || !asFlexible) {
    console.error("FAIL: scenario 19 expected results, got null");
    process.exit(1);
  }

  const afternoon = timeOptionOf(asAfternoon.allDays[0]);
  const morning = timeOptionOf(asMorning.allDays[0]);
  const flexible = timeOptionOf(asFlexible.allDays[0]);

  expectTrue(
    "scenario 19 a named slot is now checked at all (was skipped entirely)",
    asAfternoon.allDays[0].timeOption !== null
  );
  expectTrue("scenario 19 the packed afternoon is refused", afternoon.fits === false);
  expectTrue(
    "scenario 19 the free morning is accepted on the very same day",
    morning.fits === true
  );
  expectTrue(
    "scenario 19 a fitting named slot suggests no time — one was already chosen",
    morning.startMinutes === null && morning.slot === null
  );
  expectTrue(
    "scenario 19 the chosen morning window really is inside morning hours",
    morning.earliestStartMinutes >= 6 * 60 && morning.latestStartMinutes <= 12 * 60
  );
  expectTrue(
    "scenario 19 a flexible job still finds the open morning for itself",
    flexible.fits === true && flexible.slot === "morning"
  );

  // The payoff: offered a free day as well, an "afternoon" job must stop
  // being sent to the packed day even though that day is the shorter
  // drive. This is the reported symptom — a job landing on a day with
  // nine jobs already on it because only distance was ever consulted.
  const withFreeDay = suggestBestDay(
    newJob,
    { type: "afternoon" },
    home,
    ["2026-08-10", "2026-08-11"],
    existingJobs
  );
  if (!withFreeDay) {
    console.error("FAIL: scenario 19 expected a result, got null");
    process.exit(1);
  }
  const packed = withFreeDay.allDays.find((d) => d.date === "2026-08-10")!;
  const free = withFreeDay.allDays.find((d) => d.date === "2026-08-11")!;

  expectTrue(
    "scenario 19 confirms the packed day would win on distance alone",
    packed.addedDistanceKm < free.addedDistanceKm
  );
  expectTrue(
    "scenario 19 the free day is suggested instead",
    withFreeDay.suggestion.day.date === "2026-08-11"
  );
  expectTrue(
    "scenario 19 the slot-blocked day is ranked last, not hidden",
    withFreeDay.allDays[1].date === "2026-08-10"
  );
}

// --- Scenario 20: custom maxTravelRangeKm changes recommended vs none -----
// An empty day, ~11km one-way (so ~22km round trip added). Under the
// default 65km threshold that's comfortably "recommended". A user with a
// tighter 10km max should see the exact same day reclassified as "none" —
// this is the per-user threshold actually being read, not a hardcoded one.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.1, longitude: -97.0 };

  const withDefault = suggestBestDay(newJob, NONE, home, ["2026-08-10"], []);
  const withCustom = suggestBestDay(
    newJob,
    NONE,
    home,
    ["2026-08-10"],
    [],
    withPrefs({ maxTravelRangeKm: 10 })
  );
  if (!withDefault || !withCustom) {
    console.error("FAIL: scenario 20 expected results, got null");
    process.exit(1);
  }

  expectKind("scenario 20 default 65km threshold", withDefault.suggestion.kind, "recommended");
  expectKind("scenario 20 custom 10km threshold reclassifies the same day", withCustom.suggestion.kind, "none");
}

// --- Scenario 21: custom working hours change feasibility ------------------
// An empty day, ~100km one-way (~150 min travel each way). Under the
// default 8am-6pm (600 min) window that comfortably fits. A user with a
// narrow 10am-2pm (240 min) window should find the exact same job no
// longer fits — proves working hours are a real per-user setting, not the
// hardcoded 8-6 default.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.9, longitude: -97.0 };

  const withDefault = suggestBestDay(newJob, NONE, home, ["2026-08-10"], []);
  const withCustom = suggestBestDay(
    newJob,
    NONE,
    home,
    ["2026-08-10"],
    [],
    withUniformWorkingHours(10 * 60, 14 * 60)
  );
  if (!withDefault || !withCustom) {
    console.error("FAIL: scenario 21 expected results, got null");
    process.exit(1);
  }

  expectTrue(
    "scenario 21 fits inside the default 8am-6pm day",
    withDefault.allDays[0].timeOption?.fits === true
  );
  expectTrue(
    "scenario 21 the same job no longer fits inside a narrow 10am-2pm day",
    withCustom.allDays[0].timeOption?.fits === false
  );
}

// --- Scenario 22: maxJobsPerDay demotes a day below a worse-by-distance ---
// one Day A (two nearby flexible jobs) is the cheaper insertion than Day B
// (one flexible job, off-axis so insertion isn't a free colinear tuck-in)
// and wins by default. Capping maxJobsPerDay at Day A's current job count
// must demote it below Day B — the same two-tier ranking that already
// demotes a time-infeasible day (scenario 17), now driven by a plain job
// count instead.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.011, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "a1", date: "2026-08-10", latitude: 30.012, longitude: -97.0, time: NONE, durationMinutes: null, manualPosition: null },
    { id: "a2", date: "2026-08-10", latitude: 30.013, longitude: -97.0, time: NONE, durationMinutes: null, manualPosition: null },
    // Off the home/newJob longitude line, unlike a1/a2 — colinear points
    // would make insertion cost exactly 0 (triangle-inequality equality
    // case), tying with Day A instead of genuinely costing more.
    { id: "b1", date: "2026-08-11", latitude: 30.5, longitude: -96.8, time: NONE, durationMinutes: null, manualPosition: null },
  ];
  const candidateDates = ["2026-08-10", "2026-08-11"];

  const withDefault = suggestBestDay(newJob, NONE, home, candidateDates, existingJobs);
  if (!withDefault) {
    console.error("FAIL: scenario 22 expected a result, got null");
    process.exit(1);
  }
  const dayA = withDefault.allDays.find((d) => d.date === "2026-08-10")!;
  const dayB = withDefault.allDays.find((d) => d.date === "2026-08-11")!;

  expectTrue("scenario 22 Day A is cheaper than Day B by default", dayA.addedDistanceKm < dayB.addedDistanceKm);
  expectTrue("scenario 22 Day A wins by default", withDefault.suggestion.day.date === "2026-08-10");

  const withCap = suggestBestDay(
    newJob,
    NONE,
    home,
    candidateDates,
    existingJobs,
    withPrefs({ maxJobsPerDay: dayA.jobCount })
  );
  if (!withCap) {
    console.error("FAIL: scenario 22 expected a result with the cap, got null");
    process.exit(1);
  }

  expectTrue(
    "scenario 22 capping maxJobsPerDay at Day A's count picks Day B instead",
    withCap.suggestion.day.date === "2026-08-11"
  );
  expectTrue(
    "scenario 22 the capped day is ranked last, not hidden",
    withCap.allDays.length === 2 && withCap.allDays[1].date === "2026-08-10"
  );
}

// --- Scenario 23: day-shape bias — empty day, close job -> morning --------
// A genuinely empty day's single whole-day gap has a window whose plain
// midpoint used to land in "afternoon" regardless of the job (the reported
// bug). A job close to home (~5km, well inside the default 65km max travel
// range) should now be pulled toward the day's edge instead — morning,
// specifically, since ties between the two edges break toward the earlier
// one.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const closeJob = { latitude: 30.045, longitude: -97.0 };

  const result = suggestBestDay(closeJob, NONE, home, ["2026-08-10"], []);
  if (!result) {
    console.error("FAIL: scenario 23 expected a result, got null");
    process.exit(1);
  }
  const window = timeOptionOf(result.allDays[0]);

  expectTrue(
    "scenario 23 a close job on an empty day is suggested morning, not afternoon",
    window.slot === "morning"
  );
}

// --- Scenario 24: day-shape bias — empty day, far job -> afternoon --------
// Same empty day, but the job is now ~55km out — close to the default 65km
// max travel range, so closeness is low. The bias should pull it toward the
// middle of the day instead of the edge.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const farJob = { latitude: 30.0, longitude: -96.4295 };

  const result = suggestBestDay(farJob, NONE, home, ["2026-08-10"], []);
  if (!result) {
    console.error("FAIL: scenario 24 expected a result, got null");
    process.exit(1);
  }
  const window = timeOptionOf(result.allDays[0]);

  expectTrue(
    "scenario 24 a far job on an empty day is suggested afternoon, not morning",
    window.slot === "afternoon"
  );
}

// --- Scenario 25: day-shape bias flips gap selection, bounded by distance -
// Two fixed jobs (A ~16.7km from home at 10:30, B ~55.5km at 16:00) create
// three gaps. A new job at (30.16, -97.03) has two live candidates: the
// gap before A (a day-start edge, raw cost ~4.44km) and the gap between A
// and B (near mid-day, raw cost ~2.09km) — close enough in raw cost (~2.3km
// apart) for the shape bias to matter, but only when the bias is actually
// large enough relative to the account's own max travel range. Holding this
// exact geometry fixed and only changing maxTravelRangeKm (which changes
// closeness without touching any raw distance) flips which gap wins,
// confirming the bias is doing real work — and confirms it never invents a
// choice distance alone wouldn't support (addedDistanceKm always reports
// whichever gap actually won, honestly).
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const A = { latitude: 30.15, longitude: -97.0 };
  const B = { latitude: 30.5, longitude: -97.0 };
  const newJob = { latitude: 30.16, longitude: -97.03 };
  const existingJobs: ExistingJob[] = [
    { id: "A", date: "2026-08-10", ...A, time: { type: "specific", specificTime: "10:30" }, durationMinutes: null, manualPosition: null },
    { id: "B", date: "2026-08-10", ...B, time: { type: "specific", specificTime: "16:00" }, durationMinutes: null, manualPosition: null },
  ];

  // A generous max travel range makes this job read as "close" (closeness
  // near 1) -> the bias favors the day-start edge gap, before A.
  const closePreference = suggestBestDay(
    newJob, NONE, home, ["2026-08-10"], existingJobs, withPrefs({ maxTravelRangeKm: 60 })
  );
  // A tighter range makes the exact same job read as "far" (closeness well
  // under 0.5) -> the bias favors the mid-day gap, between A and B.
  const farPreference = suggestBestDay(
    newJob, NONE, home, ["2026-08-10"], existingJobs, withPrefs({ maxTravelRangeKm: 30 })
  );
  if (!closePreference || !farPreference) {
    console.error("FAIL: scenario 25 expected results, got null");
    process.exit(1);
  }

  const closeWindow = timeOptionOf(closePreference.allDays[0]);
  const farWindow = timeOptionOf(farPreference.allDays[0]);

  expectTrue(
    "scenario 25 close preference picks the day-start edge gap, before A",
    closeWindow.previousNeighbor.isHome && closeWindow.nextNeighbor.jobId === "A"
  );
  expectTrue(
    "scenario 25 far preference picks the mid-day gap, between A and B",
    farWindow.previousNeighbor.jobId === "A" && farWindow.nextNeighbor.jobId === "B"
  );
}

// --- Scenario 26: day-shape bias never moves a job out of its requested ---
// named slot. Same close/far jobs from scenarios 23-24, but both explicitly
// requesting "afternoon" on the same empty day. The bias can only ever
// choose among gaps already inside afternoon's hours (12:00-17:00) — it
// must never expand or shift the requested slot itself.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const closeJob = { latitude: 30.045, longitude: -97.0 };
  const farJob = { latitude: 30.0, longitude: -96.4295 };
  const afternoon: JobTime = { type: "afternoon" };

  const closeResult = suggestBestDay(closeJob, afternoon, home, ["2026-08-10"], []);
  const farResult = suggestBestDay(farJob, afternoon, home, ["2026-08-10"], []);
  if (!closeResult || !farResult) {
    console.error("FAIL: scenario 26 expected results, got null");
    process.exit(1);
  }

  const closeWindow = timeOptionOf(closeResult.allDays[0]);
  const farWindow = timeOptionOf(farResult.allDays[0]);

  expectTrue("scenario 26 close job still fits its requested afternoon", closeWindow.fits === true);
  expectTrue("scenario 26 far job still fits its requested afternoon", farWindow.fits === true);
  expectTrue(
    "scenario 26 close job's feasible window never starts before afternoon begins",
    closeWindow.earliestStartMinutes >= 12 * 60
  );
  expectTrue(
    "scenario 26 far job's feasible window never starts before afternoon begins",
    farWindow.earliestStartMinutes >= 12 * 60
  );
}

// --- Scenario 27: day-shape bias never touches a specific-time request ----
// suggestBestDay never calls the gap-analysis machinery at all for a
// "specific" time request (it's positioned by its own clock time, like any
// other fixed-time job) — so a close job and a far job asking for the same
// specific time must produce identical feasibility, proving the bias has
// zero effect here.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const closeJob = { latitude: 30.045, longitude: -97.0 };
  const farJob = { latitude: 30.0, longitude: -96.4295 };
  const tenAm: JobTime = { type: "specific", specificTime: "10:00" };

  const closeResult = suggestBestDay(closeJob, tenAm, home, ["2026-08-10"], []);
  const farResult = suggestBestDay(farJob, tenAm, home, ["2026-08-10"], []);
  if (!closeResult || !farResult) {
    console.error("FAIL: scenario 27 expected results, got null");
    process.exit(1);
  }

  expectTrue(
    "scenario 27 a specific-time request is unaffected by closeness (no conflict either way)",
    closeResult.allDays[0].timeFeasibility?.previousConflict === false &&
      farResult.allDays[0].timeFeasibility?.previousConflict === false
  );
}

// --- Scenario 28: real duration stops over-stacking (the reported bug) ----
// E (9:00) and F (specific, 11:10) sit very close to home and to each
// other, with narrow working hours (8:55am-11:40am) so there's no OTHER
// gap for a candidate flexible job to escape into — the E-F gap is the
// only option, isolating exactly what changes when E's duration is real.
// Left blank, E uses the flat 60-min default, and the gap comes out just
// wide enough (601-609) for the candidate to fit. With E's REAL duration
// set to 90 minutes (a long job wrongly assumed to take 60), the same gap
// closes (631 > 609) — the fix refusing to over-stack a window a longer
// job has actually consumed, instead of silently accepting it anyway.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const E = { latitude: 30.01, longitude: -97.0 };
  const F = { latitude: 30.02, longitude: -97.0 };
  const candidate = { latitude: 30.015, longitude: -97.0 };
  const prefs = withUniformWorkingHours(8 * 60 + 55, 11 * 60 + 40);

  function fitsWithEDuration(eDurationMinutes: number | null): boolean {
    const existingJobs: ExistingJob[] = [
      { id: "E", date: "2026-08-10", ...E, time: { type: "specific", specificTime: "09:00" }, durationMinutes: eDurationMinutes, manualPosition: null },
      { id: "F", date: "2026-08-10", ...F, time: { type: "specific", specificTime: "11:10" }, durationMinutes: null, manualPosition: null },
    ];
    const result = suggestBestDay(candidate, NONE, home, ["2026-08-10"], existingJobs, prefs);
    const window = result!.allDays[0].timeOption!;
    // Guard the premise: confirms it's really the isolated E-F gap being
    // evaluated in both cases, not some other gap rescuing the candidate.
    if (window.previousNeighbor.jobId !== "E" || window.nextNeighbor.jobId !== "F") {
      console.error("FAIL: scenario 28 premise broken — not evaluating the isolated E-F gap");
      process.exit(1);
    }
    return window.fits;
  }

  expectTrue(
    "scenario 28 with the flat default, E's gap looks (just) wide enough",
    fitsWithEDuration(null) === true
  );
  expectTrue(
    "scenario 28 with E's real 90-minute duration, the same gap correctly no longer fits",
    fitsWithEDuration(90) === false
  );
}

// --- Scenario 29: a real short duration can loosen a conflict too --------
// Mirrors scenario 7's geometry (one job ~27km away, ~40min travel) but
// requests 70 minutes after it. The flat 60-min default puts the required
// gap at 100 minutes (60 + 40) -> conflict, since 70 < 100. A real 15-minute
// duration only needs 55 minutes (15 + 40) -> clear, since 70 >= 55. Proves
// the fix isn't just a stricter cap — it lets a genuinely quick job free up
// room a flat assumption would have wrongly blocked.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const requestedTime: JobTime = { type: "specific", specificTime: "11:10" };

  function conflictWithDuration(durationMinutes: number | null): boolean {
    const existingJobs: ExistingJob[] = [
      { id: "E", date: "2026-08-10", latitude: 30.24, longitude: -97.0, time: { type: "specific", specificTime: "10:00" }, durationMinutes, manualPosition: null },
    ];
    const result = suggestBestDay(home, requestedTime, home, ["2026-08-10"], existingJobs);
    return result!.allDays[0].timeFeasibility?.previousConflict ?? false;
  }

  expectTrue(
    "scenario 29 the flat default flags this as a conflict",
    conflictWithDuration(null) === true
  );
  expectTrue(
    "scenario 29 a real short duration clears the exact same gap",
    conflictWithDuration(15) === false
  );
}

// --- Scenario 30: manual position wins over computed proximity -----------
// Reuses scenario 8's exact fixture (three "morning" jobs [B, A, C], not in
// nearest-neighbor order) — but this time every job carries a manual
// position spelling out [B, A, C] literally, the array order itself,
// instead of leaving it to be proximity-ordered into [C, B, A]. The result
// should follow the manual order (and cost more — 25.12km vs scenario 8's
// 21.18km — since [B, A, C] genuinely isn't the efficient arrangement).
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const morning: JobTime = { type: "morning" };
  const manualJobs: ExistingJob[] = [
    { id: "B", date: "2026-08-10", latitude: 30.0, longitude: -97.05, time: morning, durationMinutes: null, manualPosition: 0 },
    { id: "A", date: "2026-08-10", latitude: 30.05, longitude: -97.0, time: morning, durationMinutes: null, manualPosition: 1 },
    { id: "C", date: "2026-08-10", latitude: 29.97, longitude: -97.02, time: morning, durationMinutes: null, manualPosition: 2 },
  ];

  const route = planDayRoute(home, manualJobs);

  expectTrue(
    "scenario 30 manual position is followed literally, not proximity-reordered",
    route.stops.map((s) => s.jobId).join(",") === "B,A,C"
  );
  expectClose(
    "scenario 30 route total reflects the real (less efficient) manual order",
    route.totalDistanceKm,
    25.123
  );
}

// --- Scenario 31: a new job respects an existing manual order -------------
// Two flexible jobs manually pinned in a deliberately "backwards" order
// (F2, further from home, placed before F1, closer to home) — a shape
// cheapest-insertion would never produce on its own. Adding a third,
// still-further job (no manual position of its own) must slot in wherever
// it's genuinely cheapest around that fixed pair, without disturbing their
// relative order — proving a later "Add a Job" respects an existing manual
// reorder as its real baseline, not just until the next computation.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const F1 = { latitude: 30.02, longitude: -97.0 };
  const F2 = { latitude: 30.04, longitude: -97.0 };
  const newJob = { latitude: 30.06, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "F1", date: "2026-08-10", ...F1, time: NONE, durationMinutes: null, manualPosition: 1 },
    { id: "F2", date: "2026-08-10", ...F2, time: NONE, durationMinutes: null, manualPosition: 0 },
  ];

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 31 expected a result, got null");
    process.exit(1);
  }
  expectTrue("scenario 31 the new job fits", result.allDays[0].timeOption?.fits === true);

  const allJobs: ExistingJob[] = [
    ...existingJobs,
    { id: "NEW", date: "2026-08-10", ...newJob, time: NONE, durationMinutes: null, manualPosition: null },
  ];
  const fullRoute = planDayRoute(home, allJobs);
  const order = fullRoute.stops.map((s) => s.jobId);
  const f2Index = order.indexOf("F2");
  const f1Index = order.indexOf("F1");

  expectTrue(
    "scenario 31 F2 still precedes F1 once the new job is actually saved",
    f2Index !== -1 && f1Index !== -1 && f2Index < f1Index
  );
}

// --- Scenario 32: compareManualOrder reports the real cost of a reorder ---
// Same three-job fixture as scenario 30, but comparing a genuinely
// different (not a reversal — a reversed loop costs the same, a real trap
// to avoid here) proposed order, [B, C, A], against what the algorithm
// would have picked left alone. This is the exact computation behind the
// "adds ~X km more than the most efficient arrangement" warning.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const morning: JobTime = { type: "morning" };
  const dayJobs: ExistingJob[] = [
    { id: "B", date: "2026-08-10", latitude: 30.0, longitude: -97.05, time: morning, durationMinutes: null, manualPosition: null },
    { id: "A", date: "2026-08-10", latitude: 30.05, longitude: -97.0, time: morning, durationMinutes: null, manualPosition: null },
    { id: "C", date: "2026-08-10", latitude: 29.97, longitude: -97.02, time: morning, durationMinutes: null, manualPosition: null },
  ];

  const comparison = compareManualOrder(home, dayJobs, ["B", "C", "A"]);

  expectClose("scenario 32 algorithmicKm matches the computed-optimal total", comparison.algorithmicKm, 21.179);
  expectClose("scenario 32 manualKm matches the real cost of the proposed order", comparison.manualKm, 23.889);
  expectClose("scenario 32 deltaKm is the honest difference between the two", comparison.deltaKm, 2.71);
  expectTrue(
    "scenario 32 a ~2.7km difference clears MEANINGFUL_REORDER_DELTA_KM",
    comparison.meaningful === true
  );
}

// --- Scenario 33: suggestion reasoning matches the real post-save route ---
// The reported bug, reproduced directly: two existing "morning" jobs
// positioned like real, non-colinear nearby streets (sir-matt, talbot) and
// a new flexible job near their cluster but marginally closer to home.
// Before the fix, analyzeDayGaps' internal gap-splice placeholder (always
// timeType: "specific", an arbitrary exact minute) reported "fits between
// sir-matt and talbot" — but once actually saved with the suggested named
// slot, the job becomes a real member of that slot's TIED GROUP, reordered
// by orderTiedGroupByProximity (plain nearest-neighbor-from-home) — which
// puts it first, ahead of both. The fix re-simulates the real save (same
// buildDayRoute the post-save timeline runs on) before reporting the
// reasoning's neighbors, so both must now agree — checked here by literally
// calling planDayRoute on the equivalent saved data and comparing.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const morning: JobTime = { type: "morning" };
  const sirMatt = { latitude: 30.1, longitude: -97.0 };
  const talbot = { latitude: 30.0, longitude: -96.85 };
  const newJob = { latitude: 30.02, longitude: -96.965 };

  const existingJobs: ExistingJob[] = [
    { id: "sir-matt", date: "2026-08-10", ...sirMatt, time: morning, durationMinutes: null, manualPosition: null },
    { id: "talbot", date: "2026-08-10", ...talbot, time: morning, durationMinutes: null, manualPosition: null },
  ];

  const result = suggestBestDay(newJob, NONE, home, ["2026-08-10"], existingJobs);
  if (!result) {
    console.error("FAIL: scenario 33 expected a result, got null");
    process.exit(1);
  }
  const day = result.allDays[0];
  const opt = timeOptionOf(day);

  // Guard the premise structurally (not by inspecting previousNeighbor/
  // nextNeighbor — those are exactly what the fix corrects, so checking
  // them here would be asserting the pre-fix symptom, not the setup):
  // this must be a genuine "flexible resolves to a named slot, with 2+
  // existing jobs already sharing it" case — the only shape where the old
  // gap-splice placeholder and the real tied-group reorder could disagree.
  expectTrue(
    "scenario 33 premise: the suggestion resolves to a named slot shared with 2+ existing jobs",
    opt.fits === true && opt.slot === "morning" && existingJobs.length === 2
  );

  const savedJobs: ExistingJob[] = [
    ...existingJobs,
    { id: "NEW", date: "2026-08-10", ...newJob, time: { type: opt.slot as NamedTimeSlot }, durationMinutes: null, manualPosition: null },
  ];
  const realRoute = planDayRoute(home, savedJobs);
  const realOrder = realRoute.stops.map((s) => s.jobId);
  const newIndex = realOrder.indexOf("NEW");
  const realPrev = newIndex === 0 ? null : realOrder[newIndex - 1];
  const realNext = newIndex === realOrder.length - 1 ? null : realOrder[newIndex + 1];

  expectTrue(
    "scenario 33 reasoning's previousNeighbor matches the real saved route",
    opt.previousNeighbor.jobId === realPrev
  );
  expectTrue(
    "scenario 33 reasoning's nextNeighbor matches the real saved route",
    opt.nextNeighbor.jobId === realNext
  );
  expectClose(
    "scenario 33 the reported added distance matches the real saved route's total exactly",
    day.totalDistanceKm,
    realRoute.totalDistanceKm,
    0.0001
  );
}

// --- Edge cases --------------------------------------------------------------
{
  const home = { latitude: 30.4, longitude: -97.72 };
  const newJob = { latitude: 30.415, longitude: -97.715 };
  const candidateDates = ["2026-08-10", "2026-08-11"];

  const noExistingJobsResult = suggestBestDay(newJob, NONE, home, candidateDates, []);
  expectTrue(
    "an entirely empty week still returns a result for every day",
    noExistingJobsResult !== null && noExistingJobsResult.allDays.length === candidateDates.length
  );

  const noCandidatesResult = suggestBestDay(newJob, NONE, home, [], []);
  expectTrue("zero candidate dates correctly returns null", noCandidatesResult === null);
}

// --- Scenario 34: a disabled day is skipped even though it's cheaper by ---
// distance. Same shape as scenario 22 (a two-tier ranking demotes a day
// below a worse-by-distance one) but driven by the day being turned off
// entirely, rather than a time or job-count limit.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.011, longitude: -97.0 };
  const existingJobs: ExistingJob[] = [
    { id: "mon", date: "2026-08-10", latitude: 30.012, longitude: -97.0, time: NONE, durationMinutes: null, manualPosition: null },
    // Off the home/newJob longitude line, unlike mon — colinear points
    // would make insertion cost exactly 0, tying with Monday instead of
    // genuinely costing more.
    { id: "tue", date: "2026-08-11", latitude: 30.5, longitude: -96.8, time: NONE, durationMinutes: null, manualPosition: null },
  ];
  const candidateDates = ["2026-08-10", "2026-08-11"];

  const mondayOffPrefs: SchedulingPreferences = {
    ...DEFAULT_SCHEDULING_PREFERENCES,
    workingHours: {
      ...DEFAULT_SCHEDULING_PREFERENCES.workingHours,
      mon: { ...DEFAULT_SCHEDULING_PREFERENCES.workingHours.mon, enabled: false },
    },
  };

  const result = suggestBestDay(newJob, NONE, home, candidateDates, existingJobs, mondayOffPrefs);
  if (!result) {
    console.error("FAIL: scenario 34 expected a result, got null");
    process.exit(1);
  }
  const monday = result.allDays.find((d) => d.date === "2026-08-10")!;
  const tuesday = result.allDays.find((d) => d.date === "2026-08-11")!;

  expectTrue("scenario 34 Monday is cheaper by distance", monday.addedDistanceKm < tuesday.addedDistanceKm);
  expectTrue("scenario 34 Monday is marked as a day off", monday.dayEnabled === false);
  expectTrue("scenario 34 Monday has no workable time because the day is off", timeOptionOf(monday).fits === false);
  expectTrue("scenario 34 Tuesday is a normal working day", tuesday.dayEnabled === true && timeOptionOf(tuesday).fits === true);
  expectTrue(
    "scenario 34 the day that's actually open is suggested, not the cheaper closed one",
    result.suggestion.day.date === "2026-08-11"
  );
}

// --- Scenario 35: per-day hours are genuinely per-day, not a whole-week ---
// override. Saturday gets a narrow 8am-12pm window while Monday keeps the
// account default (8am-6pm) — both evaluated in the SAME call, proving
// Saturday's hours don't leak onto Monday or vice versa.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.03, longitude: -97.0 };
  const candidateDates = ["2026-08-10", "2026-08-15"]; // Monday, Saturday

  const satNarrowPrefs: SchedulingPreferences = {
    ...DEFAULT_SCHEDULING_PREFERENCES,
    workingHours: {
      ...DEFAULT_SCHEDULING_PREFERENCES.workingHours,
      sat: { enabled: true, startMinutes: 8 * 60, endMinutes: 12 * 60 },
    },
  };

  const result = suggestBestDay(newJob, NONE, home, candidateDates, [], satNarrowPrefs);
  if (!result) {
    console.error("FAIL: scenario 35 expected a result, got null");
    process.exit(1);
  }
  const monday = result.allDays.find((d) => d.date === "2026-08-10")!;
  const saturday = result.allDays.find((d) => d.date === "2026-08-15")!;

  expectTrue("scenario 35 Saturday is enabled with its own narrow window", saturday.dayEnabled === true);
  expectTrue(
    "scenario 35 Saturday's suggested window never extends past its own 12pm end",
    timeOptionOf(saturday).latestStartMinutes <= 12 * 60
  );
  expectTrue(
    "scenario 35 Monday's window still extends well past Saturday's 12pm cutoff",
    timeOptionOf(monday).latestStartMinutes > 12 * 60
  );
}

// --- Scenario 36: a fully-blocked week never reads as "recommended" -------
// Every candidate day disabled. The new job sits right next to home, so
// addedDistanceKm is tiny — comfortably under maxTravelRangeKm, which is
// the ONLY thing the old pickSuggestion looked at. Without checking whether
// the winning day is actually bookable, this would have been mislabeled
// "recommended" (or "clustered", if it happened to have a nearby existing
// job) even though nobody can actually work either day. The honest answer
// is "none" — the same "closest option, shown as context" bucket a
// genuinely-too-far week already uses — with the day still present in
// allDays (never hidden) and its timeOption still reporting why it fails.
{
  const home = { latitude: 30.0, longitude: -97.0 };
  const newJob = { latitude: 30.001, longitude: -97.0 };
  const candidateDates = ["2026-08-10", "2026-08-11"];

  const allDaysOffPrefs: SchedulingPreferences = {
    ...DEFAULT_SCHEDULING_PREFERENCES,
    workingHours: {
      ...DEFAULT_SCHEDULING_PREFERENCES.workingHours,
      mon: { ...DEFAULT_SCHEDULING_PREFERENCES.workingHours.mon, enabled: false },
      tue: { ...DEFAULT_SCHEDULING_PREFERENCES.workingHours.tue, enabled: false },
    },
  };

  const result = suggestBestDay(newJob, NONE, home, candidateDates, [], allDaysOffPrefs);
  if (!result) {
    console.error("FAIL: scenario 36 expected a result, got null");
    process.exit(1);
  }

  expectTrue(
    "scenario 36 confirms the premise: this would pass the old distance-only recommended check",
    result.allDays[0].addedDistanceKm <= allDaysOffPrefs.maxTravelRangeKm
  );
  expectKind("scenario 36 a fully-blocked week is never labeled recommended", result.suggestion.kind, "none");
  expectTrue(
    "scenario 36 both blocked days are still present, not hidden",
    result.allDays.length === 2 && result.allDays.every((d) => timeOptionOf(d).fits === false)
  );
}

console.log("\nAll scheduling scenarios passed.");
