// Booktight scheduling logic.
//
// v1 uses straight-line (haversine) distance between coordinates as a
// stand-in for actual driving distance. No routing API yet — see CLAUDE.md.

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type NamedTimeSlot = "morning" | "afternoon" | "evening" | "night";
export type TimeSlotType = NamedTimeSlot | "specific" | "none";

export interface JobTime {
  type: TimeSlotType;
  /** "HH:MM" 24-hour. Required iff type === "specific". */
  specificTime?: string;
}

export interface ExistingJob extends Coordinates {
  id: string;
  /** ISO date string, e.g. "2026-08-10". Jobs are grouped by this value. */
  date: string;
  time: JobTime;
  /** null = use the flat assumed default (resolveDurationMinutes). */
  durationMinutes: number | null;
  /** null = use the computed order. Only meaningful relative to siblings
   *  sharing this job's (date, time). */
  manualPosition: number | null;
}

export interface RouteNeighbor {
  isHome: boolean;
  jobId: string | null;
  distanceKm: number;
  /** The neighbor's own sort key, if it has one (null for home or a
   *  flexible neighbor) — used to build "fits between your 10am job..." */
  sortKeyMinutes: number | null;
  /** What kind of time produced sortKeyMinutes (null for home) — callers
   *  need this to know whether sortKeyMinutes is a real clock time
   *  ("specific") or just a named-slot anchor that was never actually set
   *  by the user, so they don't format an anchor as if it were exact. */
  timeType: TimeSlotType | null;
  /** Already resolved (real duration or the flat default) — 0 for home,
   *  since neighborBoundMinutes never reads it there. */
  durationMinutes: number;
}

export interface TimeFeasibility {
  previousConflict: boolean;
  previousGapMinutes: number | null;
  previousTravelMinutes: number | null;
  nextConflict: boolean;
  nextGapMinutes: number | null;
  nextTravelMinutes: number | null;
}

export interface DayRoute {
  date: string;
  /** Extra driving distance caused by adding the new job to this day. */
  addedDistanceKm: number;
  /** Full home -> jobs -> home distance for the day, including the new job. */
  totalDistanceKm: number;
  /** Number of jobs already booked that day (not counting the new one). */
  jobCount: number;
  /** Whether the account is set to work at all on this date's weekday. */
  dayEnabled: boolean;
  /** Closest existing job that day to the new job, if any. */
  nearestExistingJobId: string | null;
  nearestExistingJobDistanceKm: number | null;
  /**
   * Baseline "how spread out is today's existing plan already": average
   * pairwise distance between existing jobs (2+), distance from home to the
   * one existing job (exactly 1), or null (0 jobs). Used to frame how much
   * of an outlier the new job would be relative to today's normal spacing.
   */
  typicalSpacingKm: number | null;
  /** The new job's immediate neighbors in this day's route, once added. */
  previousNeighbor: RouteNeighbor;
  nextNeighbor: RouteNeighbor;
  /** Only set when the new job's requested time is "specific". */
  timeFeasibility: TimeFeasibility | null;
  /** Only set when the new job's requested time is "none" (flexible):
   *  which gap in this day's schedule it should go in, or that none work.
   *  When it fits, addedDistanceKm and the neighbors above describe THAT
   *  gap, so every number on a day agrees with the time offered for it. */
  timeOption: DayTimeOption | null;
}

export type SuggestionKind = "recommended" | "clustered" | "none";

export interface DaySuggestion {
  kind: SuggestionKind;
  day: DayRoute;
}

export interface BestDayResult {
  /** Which day to suggest (if any), and why. */
  suggestion: DaySuggestion;
  /** Every candidate day, sorted least-added-distance-first. */
  allDays: DayRoute[];
}

const EARTH_RADIUS_KM = 6371;

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** Sunday-first, matching Date.getDay() (0 = Sunday .. 6 = Saturday). */
export const WEEKDAY_KEYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

/** Which weekday a "YYYY-MM-DD" string falls on, in LOCAL time. Deliberately
 *  not `new Date(dateString).getDay()` — that parses as UTC and can name
 *  the wrong local day depending on the runtime's timezone offset. Mirrors
 *  the local-time construction week.ts already uses for the same reason. */
export function weekdayKeyOf(dateString: string): Weekday {
  const [year, month, day] = dateString.split("-").map(Number);
  return WEEKDAY_KEYS[new Date(year, month - 1, day).getDay()];
}

/** One day's on/off state and hours, as minutes-since-midnight. */
export interface DayHours {
  enabled: boolean;
  startMinutes: number;
  endMinutes: number;
}

/**
 * Per-account settings that used to be fixed constants: how far an added
 * job's extra driving can go before it's not "recommended", the working
 * hours a suggested time is kept inside (now per day of the week), and an
 * optional cap on jobs per day. Real values come from the signed-in user's
 * profile; the default below matches what was hardcoded before these
 * existed, so behavior is unchanged for anyone who hasn't visited Account
 * yet.
 */
export interface SchedulingPreferences {
  maxTravelRangeKm: number;
  workingHours: Record<Weekday, DayHours>;
  /** null = no cap, same as today's actual (uncapped) behavior. */
  maxJobsPerDay: number | null;
}

const DEFAULT_WEEKDAY_HOURS: DayHours = {
  enabled: true,
  startMinutes: 8 * 60,
  endMinutes: 18 * 60,
};

const DEFAULT_WEEKEND_HOURS: DayHours = {
  enabled: false,
  startMinutes: 8 * 60,
  endMinutes: 12 * 60,
};

export const DEFAULT_SCHEDULING_PREFERENCES: SchedulingPreferences = {
  maxTravelRangeKm: 65,
  workingHours: {
    sun: DEFAULT_WEEKEND_HOURS,
    mon: DEFAULT_WEEKDAY_HOURS,
    tue: DEFAULT_WEEKDAY_HOURS,
    wed: DEFAULT_WEEKDAY_HOURS,
    thu: DEFAULT_WEEKDAY_HOURS,
    fri: DEFAULT_WEEKDAY_HOURS,
    sat: DEFAULT_WEEKEND_HOURS,
  },
  maxJobsPerDay: null,
};

/** The flat start/end/range window the low-level time helpers below
 *  actually need — resolved once per candidate day from that day's own
 *  DayHours, since working hours are no longer the same for every day. */
interface DayScheduleWindow {
  maxTravelRangeKm: number;
  workdayStartMinutes: number;
  workdayEndMinutes: number;
}

/** Below this, an existing job is "close enough" to the new one to be worth
 *  clustering on the same day, even if that day is otherwise far from home.
 *  Deliberately not tiny — this is "same general area", not "next door" —
 *  since it only ever matters once nothing clears the threshold above, and
 *  the whole point is offering a real alternative to a totally separate
 *  cold trip. */
export const CLUSTER_DISTANCE_KM = 40;

/** Below this, a manual reorder's extra driving distance isn't worth
 *  warning about — a same-day local reorder, not a whole-day suggestion,
 *  so the bar is much smaller than the constants above. Tune freely. */
export const MEANINGFUL_REORDER_DELTA_KM = 1;

/** How heavily ranking favors a day whose OWN jobs are close to the new
 *  one, over raw added driving distance. Cheapest-insertion always finds a
 *  cheap slot at the home-adjacent start/end of ANY day's route when the
 *  new job happens to be close to home — regardless of whether that day's
 *  jobs have anything to do with it. Without this, that artifact can beat
 *  a day with genuinely relevant work. Same units (km) as addedDistanceKm,
 *  so a weight of 1 means "a day's relevance counts just as much as its
 *  route cost" — tune freely. */
export const PROXIMITY_TO_EXISTING_JOBS_WEIGHT = 1;

/** v1 approximation for converting a distance into an estimated drive time
 *  — no real routing/traffic data, consistent with the rest of this app. */
export const ASSUMED_AVERAGE_SPEED_KMH = 40;

/** How long a job is assumed to take when no real duration was entered for
 *  it. You can't leave a job the instant it starts, so this sits between a
 *  neighbor's start time and the drive to whatever comes next. Tune freely. */
export const ASSUMED_JOB_DURATION_MINUTES = 60;

/** A job's real duration when it has one, the flat assumed default when it
 *  doesn't — the one place that fallback lives. */
export function resolveDurationMinutes(
  durationMinutes: number | null | undefined
): number {
  return durationMinutes ?? ASSUMED_JOB_DURATION_MINUTES;
}

/** At or below this much room to manoeuvre, naming an exact start time is
 *  more useful than a broad slot like "Morning" — above it, the slot is
 *  the honest answer because there's real freedom. Tune freely. */
export const TIGHT_TIME_WINDOW_MINUTES = 120;

/** How strongly a flexible job's placement is pulled toward an "out and
 *  back" shape — jobs close to home biased toward the edges of the working
 *  day (morning/evening), jobs far from home biased toward its middle
 *  (afternoon) — versus pure driving-cost minimization. A soft bias, not a
 *  rule: badness() maxes out at 0.5, so this weight bounds how much
 *  effective cost (in the same km terms as addedDistanceKm) the bias can
 *  ever add — at the default 65km max travel range, at most
 *  0.5 * 0.3 * 65 ≈ 10km. A gap that's genuinely cheaper by more than that
 *  always wins on real driving distance regardless of shape. Tune freely. */
export const TIME_OF_DAY_SHAPE_WEIGHT = 0.3;

/**
 * A job's position on the close<->far spectrum: 1 right at home, 0 at or
 * beyond the account's own max travel range. Anchored to that preference
 * (rather than, say, ranking against the day's other jobs) specifically
 * because it stays meaningful even on a day with nothing else booked yet —
 * the exact case the day-shape bias most needs to handle well.
 */
function closenessFraction(distanceFromHomeKm: number, maxTravelRangeKm: number): number {
  return Math.max(0, Math.min(1, 1 - distanceFromHomeKm / maxTravelRangeKm));
}

/**
 * How poorly a moment in the working day (0 = start, 1 = end) suits a job
 * with this closeness — the "out and back" shape. Close jobs (closeness
 * near 1) are penalized for sitting away from either edge; far jobs
 * (closeness near 0) are penalized for sitting away from the middle. A 0..1
 * dayFraction always yields a 0..0.5 badness.
 */
function shapeBadness(dayFraction: number, closeness: number): number {
  const edgeDistance = Math.min(dayFraction, 1 - dayFraction);
  const middleDistance = Math.abs(dayFraction - 0.5);
  return closeness * edgeDistance + (1 - closeness) * middleDistance;
}

/** Maps a minutes-since-midnight value into a 0..1 fraction of the working
 *  day, clamped — used to compare a moment against the day-shape bias
 *  regardless of which gap it happens to fall in. */
function dayFractionOf(minutes: number, preferences: DayScheduleWindow): number {
  const span = preferences.workdayEndMinutes - preferences.workdayStartMinutes;
  if (span <= 0) return 0.5;
  return Math.max(
    0,
    Math.min(1, (minutes - preferences.workdayStartMinutes) / span)
  );
}

/** Named-slot time ranges and their "anchor" (canonical point used for
 *  ordering against specific times and for reasoning text). */
const NAMED_SLOT_RANGES: Record<
  NamedTimeSlot,
  { startMinutes: number; endMinutes: number; anchorMinutes: number }
> = {
  morning: { startMinutes: 6 * 60, endMinutes: 12 * 60, anchorMinutes: 9 * 60 },
  afternoon: { startMinutes: 12 * 60, endMinutes: 17 * 60, anchorMinutes: 14 * 60 },
  evening: { startMinutes: 17 * 60, endMinutes: 21 * 60, anchorMinutes: 18 * 60 + 30 },
  night: { startMinutes: 21 * 60, endMinutes: 24 * 60, anchorMinutes: 22 * 60 },
};

const NEW_JOB_SENTINEL_ID = "__new_job__";

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Straight-line distance between two coordinates, in kilometers. */
export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** v1 approximation: distance / assumed average speed. */
export function estimateTravelMinutes(distanceKm: number): number {
  return (distanceKm / ASSUMED_AVERAGE_SPEED_KMH) * 60;
}

/** "HH:MM" -> minutes-since-midnight. Exported for actions.ts, which needs
 *  the same conversion for a profile's stored working-hours strings. */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Minutes-since-midnight sort key for a job's time, or null if flexible. */
function getSortKeyMinutes(time: JobTime): number | null {
  if (time.type === "none") {
    return null;
  }
  if (time.type === "specific") {
    return parseTimeToMinutes(time.specificTime as string);
  }
  return NAMED_SLOT_RANGES[time.type].anchorMinutes;
}

/** Maps a point in time back to whichever named slot it falls in — used to
 *  express a flexible job's suggested position as "Afternoon" etc. */
export function minutesToNamedSlot(minutes: number): NamedTimeSlot {
  for (const [name, range] of Object.entries(NAMED_SLOT_RANGES)) {
    if (minutes >= range.startMinutes && minutes < range.endMinutes) {
      return name as NamedTimeSlot;
    }
  }
  return "night";
}

/** Formats minutes-since-midnight as "10am" / "4:30pm". */
export function formatMinutesAsClock(minutes: number): string {
  const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  const period = hours24 >= 12 ? "pm" : "am";
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return mins === 0 ? `${hours12}${period}` : `${hours12}:${String(mins).padStart(2, "0")}${period}`;
}

/** Formats minutes-since-midnight as "HH:MM" — the stored/`<input type="time">`
 *  form, as opposed to formatMinutesAsClock's human-facing "4:30pm". */
export function minutesToTimeValue(minutes: number): string {
  const wrapped = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function isNamedSlot(type: TimeSlotType | null): type is NamedTimeSlot {
  return (
    type === "morning" || type === "afternoon" || type === "evening" || type === "night"
  );
}

interface RouteStop extends Coordinates {
  id: string;
  sortKeyMinutes: number | null;
  timeType: TimeSlotType;
  /** Already resolved — see resolveDurationMinutes. */
  durationMinutes: number;
  /** null = no manual override; see ExistingJob.manualPosition. */
  manualPosition: number | null;
}

/** Total distance of home -> ordered stops -> home. */
function routeDistanceKm(home: Coordinates, orderedStops: Coordinates[]): number {
  if (orderedStops.length === 0) {
    return 0;
  }

  let total = haversineDistanceKm(home, orderedStops[0]);
  for (let i = 0; i < orderedStops.length - 1; i++) {
    total += haversineDistanceKm(orderedStops[i], orderedStops[i + 1]);
  }
  total += haversineDistanceKm(orderedStops[orderedStops.length - 1], home);

  return total;
}

/**
 * Cheapest edge of `routePoints` (a full home -> ... -> home path) to
 * insert `newStop` into, and what it costs. `insertAfterIndex` is the index
 * into `routePoints` immediately before the insertion point.
 */
function cheapestInsertion(
  routePoints: Coordinates[],
  newStop: Coordinates
): { cost: number; insertAfterIndex: number } {
  let bestCost = Infinity;
  let bestIndex = 0;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    const cost =
      haversineDistanceKm(a, newStop) +
      haversineDistanceKm(newStop, b) -
      haversineDistanceKm(a, b);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = i;
    }
  }

  return { cost: bestCost, insertAfterIndex: bestIndex };
}

/**
 * Like cheapestInsertion, but for a whole ordered block of stops rather
 * than a single one — used to place a manually-reordered group as a unit,
 * preserving its internal order, instead of re-deciding each stop's
 * position independently.
 */
function cheapestBlockInsertion(
  routePoints: Coordinates[],
  block: Coordinates[]
): { cost: number; insertAfterIndex: number } {
  let bestCost = Infinity;
  let bestIndex = 0;
  const first = block[0];
  const last = block[block.length - 1];
  let internalCost = 0;
  for (let i = 0; i < block.length - 1; i++) {
    internalCost += haversineDistanceKm(block[i], block[i + 1]);
  }

  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    const cost =
      haversineDistanceKm(a, first) +
      internalCost +
      haversineDistanceKm(last, b) -
      haversineDistanceKm(a, b);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = i;
    }
  }

  return { cost: bestCost, insertAfterIndex: bestIndex };
}

/** Average of every pairwise distance among a set of points. */
function averagePairwiseDistanceKm(points: Coordinates[]): number {
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      total += haversineDistanceKm(points[i], points[j]);
      pairs++;
    }
  }
  return total / pairs;
}

/**
 * Orders a group of stops that all share the same sort key (e.g. two
 * "Morning" jobs). Stops with a manual position win outright — sorted by
 * that instead of computed — since a manual reorder is a deliberate
 * override, not a tie the computer should keep re-breaking on its own.
 * Whatever's left (no manual position) is ordered via nearest-neighbor
 * starting from wherever the manual block ends (or from wherever the route
 * currently stands, if there's no manual block at all) — so an untouched
 * group behaves exactly as it always has.
 */
function orderTiedGroupByProximity(from: Coordinates, group: RouteStop[]): RouteStop[] {
  const manuallyOrdered = group
    .filter((stop) => stop.manualPosition !== null)
    .sort((a, b) => (a.manualPosition as number) - (b.manualPosition as number));
  const remaining = group.filter((stop) => stop.manualPosition === null);

  const ordered: RouteStop[] = [...manuallyOrdered];
  let current: Coordinates = ordered.length > 0 ? ordered[ordered.length - 1] : from;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const distance = haversineDistanceKm(current, remaining[i]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }
    ordered.push(remaining[nearestIndex]);
    current = remaining[nearestIndex];
    remaining.splice(nearestIndex, 1);
  }

  return ordered;
}

/**
 * Builds the chronological skeleton from every fixed-time stop: grouped by
 * exact sort key (ascending), with ties within a group broken by proximity
 * — first to whichever point the route is coming from (home, or the last
 * stop of the previous group), then to each other.
 */
function buildFixedSkeleton(home: Coordinates, fixedStops: RouteStop[]): RouteStop[] {
  const groups = new Map<number, RouteStop[]>();
  for (const stop of fixedStops) {
    const key = stop.sortKeyMinutes as number;
    const group = groups.get(key) ?? [];
    group.push(stop);
    groups.set(key, group);
  }

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => a - b);

  const skeleton: RouteStop[] = [];
  let current = home;
  for (const key of sortedKeys) {
    const group = groups.get(key) as RouteStop[];
    const ordered = group.length > 1 ? orderTiedGroupByProximity(current, group) : group;
    skeleton.push(...ordered);
    current = ordered[ordered.length - 1];
  }

  return skeleton;
}

/**
 * Builds a day's route: jobs with a fixed time (named slot or specific)
 * are placed in strict chronological order — that's non-negotiable, it's
 * literally when they're booked. Flexible ("none") jobs have no fixed
 * position, so each is slotted into whichever edge of that chronological
 * skeleton is cheapest — with one override: flexible stops carrying a
 * manual position are placed FIRST, as a single fixed block (their
 * internal order preserved, positioned wherever that whole block is
 * cheapest to insert), and only the remaining, still-unpositioned stops
 * are then cheapest-inserted one at a time around it, same as today. This
 * is what makes a later "Add a Job" respect an existing manual reorder
 * without any special-casing: a brand new job has no manual position, so
 * it always lands in the second pass, reacting to whatever the block
 * already pinned rather than competing with it.
 */
function insertFlexibleStops(
  home: Coordinates,
  skeleton: RouteStop[],
  flexible: RouteStop[]
): RouteStop[] {
  const ordered = [...skeleton];

  const manualBlock = flexible
    .filter((stop) => stop.manualPosition !== null)
    .sort((a, b) => (a.manualPosition as number) - (b.manualPosition as number));
  const unpositioned = flexible.filter((stop) => stop.manualPosition === null);

  if (manualBlock.length > 0) {
    const routePoints = [home, ...ordered, home];
    const { insertAfterIndex } = cheapestBlockInsertion(routePoints, manualBlock);
    ordered.splice(insertAfterIndex, 0, ...manualBlock);
  }

  for (const stop of unpositioned) {
    const routePoints = [home, ...ordered, home];
    const { insertAfterIndex } = cheapestInsertion(routePoints, stop);
    ordered.splice(insertAfterIndex, 0, stop);
  }
  return ordered;
}

function buildDayRoute(home: Coordinates, stops: RouteStop[]): {
  orderedStops: RouteStop[];
  totalDistanceKm: number;
} {
  const fixedStops = stops.filter((s) => s.sortKeyMinutes !== null);
  const flexible = stops.filter((s) => s.sortKeyMinutes === null);

  const ordered = insertFlexibleStops(home, buildFixedSkeleton(home, fixedStops), flexible);

  return { orderedStops: ordered, totalDistanceKm: routeDistanceKm(home, ordered) };
}

export interface PlannedRouteStop {
  jobId: string;
  /** Straight-line distance from the previous stop — from home for the
   *  first one. */
  distanceFromPreviousKm: number;
  /** Running total from home up to and including this stop. */
  cumulativeDistanceKm: number;
}

export interface PlannedDayRoute {
  /** Stops in the order they should actually be visited. */
  stops: PlannedRouteStop[];
  /** The final leg from the last stop back home. */
  returnHomeKm: number;
  /** Full home -> stops -> home distance for the day. */
  totalDistanceKm: number;
}

/**
 * The order a day's jobs should actually be visited in, with the distance
 * of each leg — the same route buildDayRoute already computes for the
 * suggestion logic, just made visible.
 *
 * Deliberately a thin wrapper: the ordering is entirely buildDayRoute's
 * (chronological for fixed-time jobs, cheapest-insertion for flexible
 * ones, home anchoring both ends) and totalDistanceKm comes straight from
 * it rather than being re-summed here, so what the table shows can never
 * drift from what the scheduler decided.
 */
export function planDayRoute(home: Coordinates, jobs: ExistingJob[]): PlannedDayRoute {
  const routeStops: RouteStop[] = jobs.map((job) => ({
    id: job.id,
    latitude: job.latitude,
    longitude: job.longitude,
    sortKeyMinutes: getSortKeyMinutes(job.time),
    timeType: job.time.type,
    durationMinutes: resolveDurationMinutes(job.durationMinutes),
    manualPosition: job.manualPosition,
  }));

  const { orderedStops, totalDistanceKm } = buildDayRoute(home, routeStops);

  const stops: PlannedRouteStop[] = [];
  let previous: Coordinates = home;
  let cumulativeDistanceKm = 0;

  for (const stop of orderedStops) {
    const distanceFromPreviousKm = haversineDistanceKm(previous, stop);
    cumulativeDistanceKm += distanceFromPreviousKm;
    stops.push({ jobId: stop.id, distanceFromPreviousKm, cumulativeDistanceKm });
    previous = stop;
  }

  return {
    stops,
    returnHomeKm: orderedStops.length === 0 ? 0 : haversineDistanceKm(previous, home),
    totalDistanceKm,
  };
}

export interface ManualOrderComparison {
  /** The day's real total distance if the proposed order is kept. */
  manualKm: number;
  /** What the day would total if those same jobs were left to the
   *  computed order instead — the honest baseline a manual reorder is
   *  judged against. */
  algorithmicKm: number;
  /** manualKm - algorithmicKm. Positive means the manual order costs more
   *  driving; can be negative or zero (a manual choice is never blocked,
   *  even when it happens to also be the cheaper one). */
  deltaKm: number;
  /** deltaKm clears MEANINGFUL_REORDER_DELTA_KM — worth surfacing to the
   *  person making the change, not just silently applying it. */
  meaningful: boolean;
}

/**
 * Compares a day's real distance under a proposed manual order for one
 * group of jobs against what the computer would have picked for that same
 * group left alone — the number behind the "this costs more than the most
 * efficient arrangement" warning. Reuses planDayRoute for both sides, so
 * this can never drift from what actually gets saved or from what the
 * timeline actually shows.
 */
export function compareManualOrder(
  home: Coordinates,
  dayJobs: ExistingJob[],
  proposedOrder: string[]
): ManualOrderComparison {
  const proposedPosition = new Map(proposedOrder.map((id, index) => [id, index]));

  const manualJobs = dayJobs.map((job) =>
    proposedPosition.has(job.id)
      ? { ...job, manualPosition: proposedPosition.get(job.id) as number }
      : job
  );
  const algorithmicJobs = dayJobs.map((job) =>
    proposedPosition.has(job.id) ? { ...job, manualPosition: null } : job
  );

  const manualKm = planDayRoute(home, manualJobs).totalDistanceKm;
  const algorithmicKm = planDayRoute(home, algorithmicJobs).totalDistanceKm;
  const deltaKm = manualKm - algorithmicKm;

  return { manualKm, algorithmicKm, deltaKm, meaningful: deltaKm > MEANINGFUL_REORDER_DELTA_KM };
}

function computeTimeFeasibility(
  newSortKeyMinutes: number,
  previousNeighbor: RouteNeighbor,
  nextNeighbor: RouteNeighbor,
  newJobDurationMinutes: number
): TimeFeasibility {
  let previousGapMinutes: number | null = null;
  let previousTravelMinutes: number | null = null;
  let previousConflict = false;
  if (!previousNeighbor.isHome && previousNeighbor.sortKeyMinutes !== null) {
    previousGapMinutes = newSortKeyMinutes - previousNeighbor.sortKeyMinutes;
    previousTravelMinutes = estimateTravelMinutes(previousNeighbor.distanceKm);
    // Not just the drive — the previous job has to actually finish first.
    previousConflict =
      previousGapMinutes < previousNeighbor.durationMinutes + previousTravelMinutes;
  }

  let nextGapMinutes: number | null = null;
  let nextTravelMinutes: number | null = null;
  let nextConflict = false;
  if (!nextNeighbor.isHome && nextNeighbor.sortKeyMinutes !== null) {
    nextGapMinutes = nextNeighbor.sortKeyMinutes - newSortKeyMinutes;
    nextTravelMinutes = estimateTravelMinutes(nextNeighbor.distanceKm);
    // This job has to finish (its own duration) before the drive can start.
    nextConflict = nextGapMinutes < newJobDurationMinutes + nextTravelMinutes;
  }

  return {
    previousConflict,
    previousGapMinutes,
    previousTravelMinutes,
    nextConflict,
    nextGapMinutes,
    nextTravelMinutes,
  };
}

export interface DayTimeOption {
  /** False only when EVERY gap in the day's schedule fails — not just the
   *  geometrically closest one. */
  fits: boolean;
  /** What actually constrains the chosen gap. isHome covers the start/end
   *  of the working day. Meaningful when fits === true. */
  previousNeighbor: RouteNeighbor;
  nextNeighbor: RouteNeighbor;
  /** Feasible range of start times, accounting for travel and job length. */
  earliestStartMinutes: number;
  latestStartMinutes: number;
  /** How much time the gap is short by (only set when fits === false). */
  shortfallMinutes: number | null;
  /** Exact start time, when the window is tight enough to be worth naming. */
  startMinutes: number | null;
  /** Named slot, when there's enough room that an exact time would be
   *  false precision. Exactly one of this and startMinutes is set when
   *  fits === true; both are null when nothing fits. */
  slot: NamedTimeSlot | null;
  /** When fits === false: which parts of the day are already booked up, so
   *  the message can name them rather than cite one arbitrary pair. */
  blockedSlots: NamedTimeSlot[];
}

/**
 * When a neighbor releases you / needs you, in minutes-since-midnight.
 *
 * A "specific" neighbor is a real commitment the user typed, so it pins an
 * exact edge. A named-slot neighbor's sortKeyMinutes is only an ordering
 * ANCHOR (9am for "morning") that the user never actually chose, so it
 * constrains by the slot's full range instead — treating the anchor as a
 * deadline would invent conflicts that don't exist. Home and flexible
 * neighbors impose no clock constraint at all.
 */
function neighborBoundMinutes(
  neighbor: RouteNeighbor,
  edge: "previous" | "next"
): number | null {
  if (neighbor.isHome) return null;
  if (neighbor.timeType === "specific" && neighbor.sortKeyMinutes !== null) {
    return neighbor.sortKeyMinutes;
  }
  if (isNamedSlot(neighbor.timeType)) {
    const range = NAMED_SLOT_RANGES[neighbor.timeType];
    // Most generous reading of the slot: it could start as early as
    // possible, or accept you as late as possible.
    return edge === "previous" ? range.startMinutes : range.endMinutes;
  }
  return null;
}

/** A neighbor record for a route stop, or for home when there isn't one. */
function buildNeighbor(
  stop: RouteStop | null,
  newJob: Coordinates,
  home: Coordinates
): RouteNeighbor {
  if (!stop) {
    return {
      isHome: true,
      jobId: null,
      distanceKm: haversineDistanceKm(newJob, home),
      sortKeyMinutes: null,
      timeType: null,
      durationMinutes: 0,
    };
  }
  return {
    isHome: false,
    jobId: stop.id,
    distanceKm: haversineDistanceKm(newJob, stop),
    sortKeyMinutes: stop.sortKeyMinutes,
    timeType: stop.timeType,
    durationMinutes: stop.durationMinutes,
  };
}

/**
 * The range of start times that actually work in one gap. You can't leave
 * the previous job the moment it starts, you can't teleport, and you have
 * to finish this job AND drive to the next one before that one begins.
 */
function computeGapWindow(
  previousNeighbor: RouteNeighbor,
  nextNeighbor: RouteNeighbor,
  preferences: DayScheduleWindow,
  newJobDurationMinutes: number
): { earliestStartMinutes: number; latestStartMinutes: number } {
  const previousBound = neighborBoundMinutes(previousNeighbor, "previous");
  const nextBound = neighborBoundMinutes(nextNeighbor, "next");

  // The previous neighbor's OWN duration — how long they occupy before
  // you're free to leave and travel to this job. Distinct from
  // newJobDurationMinutes below, which is this job's own duration.
  const earliestStartMinutes =
    previousBound === null
      ? preferences.workdayStartMinutes +
        (previousNeighbor.isHome ? estimateTravelMinutes(previousNeighbor.distanceKm) : 0)
      : previousBound +
        previousNeighbor.durationMinutes +
        estimateTravelMinutes(previousNeighbor.distanceKm);

  const latestStartMinutes =
    nextBound === null
      ? preferences.workdayEndMinutes -
        newJobDurationMinutes -
        (nextNeighbor.isHome ? estimateTravelMinutes(nextNeighbor.distanceKm) : 0)
      : nextBound -
        estimateTravelMinutes(nextNeighbor.distanceKm) -
        newJobDurationMinutes;

  return { earliestStartMinutes, latestStartMinutes };
}

/**
 * Where within [earliestStartMinutes, latestStartMinutes] the day-shape bias
 * prefers, expressed in real minutes. shapeBadness is piecewise-linear in
 * dayFraction and unimodal on each side of the day's midpoint, so its
 * minimum over any sub-window is always at one of that sub-window's own
 * endpoints or (when the window spans it) the day's exact midpoint — no
 * search needed, just checking those candidates. Ties resolve to the
 * earlier candidate (f0 is checked first), matching what a person expects
 * on a wide-open day.
 */
function biasedTargetMinutes(
  earliestStartMinutes: number,
  latestStartMinutes: number,
  closeness: number,
  preferences: DayScheduleWindow
): number {
  if (latestStartMinutes <= earliestStartMinutes) {
    return earliestStartMinutes;
  }

  const f0 = dayFractionOf(earliestStartMinutes, preferences);
  const f1 = dayFractionOf(latestStartMinutes, preferences);

  const candidates = f0 <= 0.5 && 0.5 <= f1 ? [f0, f1, 0.5] : [f0, f1];
  let bestFraction = candidates[0];
  let bestBadness = shapeBadness(bestFraction, closeness);
  for (const fraction of candidates.slice(1)) {
    const badness = shapeBadness(fraction, closeness);
    if (badness < bestBadness) {
      bestBadness = badness;
      bestFraction = fraction;
    }
  }

  const span = f1 - f0;
  const t = span === 0 ? 0 : (bestFraction - f0) / span;
  return earliestStartMinutes + t * (latestStartMinutes - earliestStartMinutes);
}

/** Exact time when the window is tight, named slot when there's real room —
 *  biased toward the day-shape target rather than the window's raw
 *  midpoint. */
function placeWithinWindow(
  earliestStartMinutes: number,
  latestStartMinutes: number,
  closeness: number,
  preferences: DayScheduleWindow
): { startMinutes: number | null; slot: NamedTimeSlot | null } {
  const target = biasedTargetMinutes(
    earliestStartMinutes,
    latestStartMinutes,
    closeness,
    preferences
  );

  if (latestStartMinutes - earliestStartMinutes > TIGHT_TIME_WINDOW_MINUTES) {
    return { startMinutes: null, slot: minutesToNamedSlot(Math.round(target)) };
  }

  // Round to a time a person would actually say, then clamp back inside
  // the window so rounding can never push the answer out of feasibility.
  let startMinutes = Math.round(target / 15) * 15;
  if (startMinutes < earliestStartMinutes) {
    startMinutes = Math.ceil(earliestStartMinutes / 15) * 15;
  }
  if (startMinutes > latestStartMinutes) {
    startMinutes = Math.floor(latestStartMinutes / 15) * 15;
  }
  if (startMinutes < earliestStartMinutes || startMinutes > latestStartMinutes) {
    startMinutes = Math.round(earliestStartMinutes);
  }

  return { startMinutes, slot: null };
}

/**
 * Which named slots the day's booked work already occupies — used to say
 * "your morning and afternoon are fully booked" instead of reporting on one
 * arbitrary pair of jobs as if they were the whole day.
 */
function blockedSlotsFor(fixedStops: RouteStop[]): NamedTimeSlot[] {
  const slots = new Set<NamedTimeSlot>();
  for (const stop of fixedStops) {
    if (stop.sortKeyMinutes !== null) {
      slots.add(minutesToNamedSlot(stop.sortKeyMinutes));
    }
  }
  return Array.from(slots).sort(
    (a, b) => NAMED_SLOT_RANGES[a].startMinutes - NAMED_SLOT_RANGES[b].startMinutes
  );
}

interface DayGapAnalysis {
  option: DayTimeOption;
  /** Set only when a gap fits: the real cost of using that gap. */
  addedDistanceKm: number | null;
  orderedStops: RouteStop[] | null;
  totalDistanceKm: number | null;
}

/**
 * Evaluates EVERY gap in a day's schedule — before the first booked job,
 * between each consecutive pair, and after the last — rather than only the
 * one that happens to be cheapest by distance.
 *
 * That distinction is the whole point: cheapest-insertion picks a gap purely
 * on driving distance, so a job dropped right next to a 10:00 and a 10:15
 * booking looks ideal geometrically while being impossible in time. Checking
 * only that gap reports the entire day as unbookable even when the morning
 * before it, or the whole afternoon after it, is wide open.
 *
 * Gaps are bounded by FIXED-time jobs only (specific times and named slots);
 * flexible jobs have no clock position, so they can't bound anything. Among
 * the gaps that genuinely fit, the one adding the least driving wins.
 *
 * `requestedSlot` narrows the search to one named slot's hours. A job booked
 * "Afternoon" can only start between 12:00 and 17:00, so a gap that's wide
 * open at 8am is no use to it — without this it would be dropped onto a day
 * whose afternoon is completely full.
 */
function analyzeDayGaps(
  newJob: Coordinates,
  home: Coordinates,
  routeStops: RouteStop[],
  baselineTotalKm: number,
  requestedSlot: NamedTimeSlot | null,
  preferences: DayScheduleWindow,
  newJobDurationMinutes: number
): DayGapAnalysis {
  const skeleton = buildFixedSkeleton(
    home,
    routeStops.filter((s) => s.sortKeyMinutes !== null)
  );
  const flexibleStops = routeStops.filter((s) => s.sortKeyMinutes === null);

  // How close this job is to home, on the account's own max-travel-range
  // scale — drives the day-shape bias below. Computed once; it doesn't
  // depend on which gap is being considered.
  const closeness = closenessFraction(
    haversineDistanceKm(home, newJob),
    preferences.maxTravelRangeKm
  );

  // home -> first -> ... -> last -> home. With no fixed jobs this is a
  // single gap spanning the working day, which covers the empty day too.
  const bounds: (RouteStop | null)[] = [null, ...skeleton, null];

  let best: {
    option: DayTimeOption;
    addedDistanceKm: number;
    effectiveCostKm: number;
    orderedStops: RouteStop[];
    totalDistanceKm: number;
  } | null = null;
  let closestFailure: DayTimeOption | null = null;
  let closestFailureDistanceKm = Infinity;

  for (let i = 0; i < bounds.length - 1; i++) {
    const previousNeighbor = buildNeighbor(bounds[i], newJob, home);
    const nextNeighbor = buildNeighbor(bounds[i + 1], newJob, home);
    const gapWindow = computeGapWindow(
      previousNeighbor,
      nextNeighbor,
      preferences,
      newJobDurationMinutes
    );

    // A job booked for a named slot can only start inside that slot's
    // hours, so intersect the gap with them. A gap that's wide open at 8am
    // is no help to an "Afternoon" job.
    const slotRange = requestedSlot ? NAMED_SLOT_RANGES[requestedSlot] : null;
    const earliestStartMinutes = slotRange
      ? Math.max(gapWindow.earliestStartMinutes, slotRange.startMinutes)
      : gapWindow.earliestStartMinutes;
    const latestStartMinutes = slotRange
      ? Math.min(gapWindow.latestStartMinutes, slotRange.endMinutes)
      : gapWindow.latestStartMinutes;

    if (earliestStartMinutes > latestStartMinutes) {
      // Remember the least-bad failure so the message can quote a
      // meaningful shortfall if nothing at all works.
      const reach = previousNeighbor.distanceKm + nextNeighbor.distanceKm;
      if (reach < closestFailureDistanceKm) {
        closestFailureDistanceKm = reach;
        closestFailure = {
          fits: false,
          previousNeighbor,
          nextNeighbor,
          earliestStartMinutes,
          latestStartMinutes,
          shortfallMinutes: earliestStartMinutes - latestStartMinutes,
          startMinutes: null,
          slot: null,
          blockedSlots: blockedSlotsFor(skeleton),
        };
      }
      continue;
    }

    const placement = placeWithinWindow(
      earliestStartMinutes,
      latestStartMinutes,
      closeness,
      preferences
    );

    // Cost this gap for real. The job is spliced in at THIS position in the
    // skeleton rather than given a clock time and re-sorted — a named-slot
    // bound constrains by its whole range, so a time inside this gap can
    // still sort to the wrong side of that job's 9am anchor and silently
    // collapse two gaps into one. Splicing by index can't drift. Flexible
    // jobs are then re-inserted around it, which a bare edge-cost formula
    // would miss.
    const placedStop: RouteStop = {
      id: NEW_JOB_SENTINEL_ID,
      latitude: newJob.latitude,
      longitude: newJob.longitude,
      sortKeyMinutes:
        placement.startMinutes ??
        Math.round((earliestStartMinutes + latestStartMinutes) / 2),
      timeType: "specific",
      durationMinutes: newJobDurationMinutes,
      manualPosition: null,
    };
    const orderedStops = insertFlexibleStops(
      home,
      [...skeleton.slice(0, i), placedStop, ...skeleton.slice(i)],
      flexibleStops
    );
    const totalDistanceKm = routeDistanceKm(home, orderedStops);
    const addedDistanceKm = totalDistanceKm - baselineTotalKm;

    // Which gap "wins" is biased toward the out-and-back shape, on top of
    // real driving cost — but the addedDistanceKm reported below always
    // stays the true figure; the bias only ever affects this comparison.
    const gapMidpointFraction = dayFractionOf(
      (earliestStartMinutes + latestStartMinutes) / 2,
      preferences
    );
    const effectiveCostKm =
      addedDistanceKm +
      TIME_OF_DAY_SHAPE_WEIGHT *
        shapeBadness(gapMidpointFraction, closeness) *
        preferences.maxTravelRangeKm;

    if (!best || effectiveCostKm < best.effectiveCostKm) {
      best = {
        option: {
          fits: true,
          previousNeighbor,
          nextNeighbor,
          earliestStartMinutes,
          latestStartMinutes,
          shortfallMinutes: null,
          // Nothing to suggest when the time was already chosen — this is
          // a feasibility verdict on the requested slot, not an offer to
          // move the job to a different one.
          startMinutes: requestedSlot ? null : placement.startMinutes,
          slot: requestedSlot ? null : placement.slot,
          blockedSlots: [],
        },
        addedDistanceKm,
        effectiveCostKm,
        orderedStops,
        totalDistanceKm,
      };
    }
  }

  if (best) {
    return {
      option: best.option,
      addedDistanceKm: best.addedDistanceKm,
      orderedStops: best.orderedStops,
      totalDistanceKm: best.totalDistanceKm,
    };
  }

  return {
    option: closestFailure ?? {
      fits: false,
      previousNeighbor: buildNeighbor(null, newJob, home),
      nextNeighbor: buildNeighbor(null, newJob, home),
      earliestStartMinutes: preferences.workdayStartMinutes,
      latestStartMinutes: preferences.workdayEndMinutes,
      shortfallMinutes: null,
      startMinutes: null,
      slot: null,
      blockedSlots: blockedSlotsFor(skeleton),
    },
    addedDistanceKm: null,
    orderedStops: null,
    totalDistanceKm: null,
  };
}

/**
 * Given a new job's coordinates and requested time, the tradesperson's home
 * address, every candidate day in the week, and the week's existing jobs
 * (each tagged with the day and time they're booked), find which day
 * minimizes the extra driving distance added by fitting the new job into
 * that day's home -> jobs -> home route — and whether that day is actually
 * worth suggesting at all.
 *
 * Returns null only if there are no candidate days at all.
 */
export function suggestBestDay(
  newJob: Coordinates,
  newJobTime: JobTime,
  home: Coordinates,
  candidateDates: string[],
  existingJobs: ExistingJob[],
  preferences: SchedulingPreferences = DEFAULT_SCHEDULING_PREFERENCES,
  newJobDurationMinutesRaw: number | null = null
): BestDayResult | null {
  if (candidateDates.length === 0) {
    return null;
  }

  const newJobDurationMinutes = resolveDurationMinutes(newJobDurationMinutesRaw);

  const jobsByDate = new Map<string, ExistingJob[]>();
  for (const job of existingJobs) {
    const jobsForDate = jobsByDate.get(job.date) ?? [];
    jobsForDate.push(job);
    jobsByDate.set(job.date, jobsForDate);
  }

  const newJobSortKey = getSortKeyMinutes(newJobTime);

  const allDays: DayRoute[] = candidateDates.map((date) => {
    const weekday = weekdayKeyOf(date);
    const dayHours = preferences.workingHours[weekday] ?? DEFAULT_SCHEDULING_PREFERENCES.workingHours[weekday];
    const dayWindow: DayScheduleWindow = {
      maxTravelRangeKm: preferences.maxTravelRangeKm,
      workdayStartMinutes: dayHours.startMinutes,
      workdayEndMinutes: dayHours.endMinutes,
    };

    const stops = jobsByDate.get(date) ?? [];
    const routeStops: RouteStop[] = stops.map((job) => ({
      id: job.id,
      latitude: job.latitude,
      longitude: job.longitude,
      sortKeyMinutes: getSortKeyMinutes(job.time),
      timeType: job.time.type,
      durationMinutes: resolveDurationMinutes(job.durationMinutes),
      manualPosition: job.manualPosition,
    }));

    const before = buildDayRoute(home, routeStops);
    const newStop: RouteStop = {
      id: NEW_JOB_SENTINEL_ID,
      latitude: newJob.latitude,
      longitude: newJob.longitude,
      sortKeyMinutes: newJobSortKey,
      timeType: newJobTime.type,
      durationMinutes: newJobDurationMinutes,
      manualPosition: null,
    };
    // Geometric baseline: cheapest place to slot the job in by distance
    // alone. For a fixed-time job that's the whole story, since chronology
    // already decides where it goes.
    const after = buildDayRoute(home, [...routeStops, newStop]);

    // A flexible job has no clock position, so distance alone would pick a
    // gap that may be impossible in time. Check every gap in the day and
    // use the cheapest one that actually works.
    const isFlexible = newJobTime.type === "none";
    const requestedSlot = isNamedSlot(newJobTime.type) ? newJobTime.type : null;
    const gapAnalysis =
      dayHours.enabled && (isFlexible || requestedSlot)
        ? analyzeDayGaps(
            newJob,
            home,
            routeStops,
            before.totalDistanceKm,
            requestedSlot,
            dayWindow,
            newJobDurationMinutes
          )
        : null;
    // Only a flexible job's placement is ours to choose. A named-slot job
    // is positioned by its anchor like any other fixed-time job, so its
    // gap analysis is a feasibility verdict only — overriding the route
    // with a gap it won't actually be placed in would make the distance
    // disagree with where the job really lands.
    const usable = isFlexible && gapAnalysis?.option.fits ? gapAnalysis : null;

    let orderedStops = usable?.orderedStops ?? after.orderedStops;
    let totalDistanceKm = usable?.totalDistanceKm ?? after.totalDistanceKm;
    let addedDistanceKm =
      usable?.addedDistanceKm ?? after.totalDistanceKm - before.totalDistanceKm;

    const newIndex = orderedStops.findIndex((s) => s.id === NEW_JOB_SENTINEL_ID);
    const beforeStop = newIndex <= 0 ? null : orderedStops[newIndex - 1];
    const afterStop =
      newIndex === orderedStops.length - 1 ? null : orderedStops[newIndex + 1];

    let previousNeighbor = buildNeighbor(beforeStop, newJob, home);
    let nextNeighbor = buildNeighbor(afterStop, newJob, home);
    // A day that's off is unbookable no matter what time was requested —
    // unlike a full-day gap failure, this also has to cover "specific"
    // requests, which never get a timeOption from gapAnalysis at all
    // (analyzeDayGaps only runs for flexible/named-slot requests above).
    let dayTimeOption: DayTimeOption | null = !dayHours.enabled
      ? {
          fits: false,
          previousNeighbor: buildNeighbor(null, newJob, home),
          nextNeighbor: buildNeighbor(null, newJob, home),
          earliestStartMinutes: dayWindow.workdayStartMinutes,
          latestStartMinutes: dayWindow.workdayEndMinutes,
          shortfallMinutes: null,
          startMinutes: null,
          slot: null,
          blockedSlots: [],
        }
      : (gapAnalysis?.option ?? null);

    // A flexible job whose suggestion resolved to a NAMED slot (a wide
    // window, not an exact time) doesn't actually get inserted at "the gap
    // that happened to be cheapest" once saved — it becomes a real member
    // of that slot's tied group, and buildFixedSkeleton re-sorts the WHOLE
    // group by proximity from scratch (orderTiedGroupByProximity), same as
    // any other same-slot jobs already booked. The gap analysis above
    // still correctly decides feasibility and which slot to suggest, but
    // its internal placeholder for the job (timeType: "specific", an
    // arbitrary exact minute — scheduling.ts:889) doesn't match what
    // actually gets saved (timeType: the named slot) whenever the answer
    // is a slot rather than an exact time. Re-simulating with a stop
    // shaped like the real save — same buildDayRoute the post-save
    // timeline runs on — keeps the reasoning text and distance figures
    // honest about what will actually happen, not the gap analysis's own
    // intermediate guess.
    if (usable && usable.option.slot) {
      const namedSlotStop: RouteStop = {
        id: NEW_JOB_SENTINEL_ID,
        latitude: newJob.latitude,
        longitude: newJob.longitude,
        sortKeyMinutes: NAMED_SLOT_RANGES[usable.option.slot].anchorMinutes,
        timeType: usable.option.slot,
        durationMinutes: newJobDurationMinutes,
        manualPosition: null,
      };
      const trueRoute = buildDayRoute(home, [...routeStops, namedSlotStop]);
      const trueIndex = trueRoute.orderedStops.findIndex(
        (s) => s.id === NEW_JOB_SENTINEL_ID
      );
      const trueBeforeStop = trueIndex <= 0 ? null : trueRoute.orderedStops[trueIndex - 1];
      const trueAfterStop =
        trueIndex === trueRoute.orderedStops.length - 1
          ? null
          : trueRoute.orderedStops[trueIndex + 1];

      previousNeighbor = buildNeighbor(trueBeforeStop, newJob, home);
      nextNeighbor = buildNeighbor(trueAfterStop, newJob, home);
      orderedStops = trueRoute.orderedStops;
      totalDistanceKm = trueRoute.totalDistanceKm;
      addedDistanceKm = trueRoute.totalDistanceKm - before.totalDistanceKm;
      dayTimeOption = { ...usable.option, previousNeighbor, nextNeighbor };
    }

    const timeFeasibility =
      newJobTime.type === "specific"
        ? computeTimeFeasibility(
            newJobSortKey as number,
            previousNeighbor,
            nextNeighbor,
            newJobDurationMinutes
          )
        : null;

    let nearestExistingJobId: string | null = null;
    let nearestExistingJobDistanceKm: number | null = null;
    for (const job of stops) {
      const distance = haversineDistanceKm(newJob, job);
      if (nearestExistingJobDistanceKm === null || distance < nearestExistingJobDistanceKm) {
        nearestExistingJobDistanceKm = distance;
        nearestExistingJobId = job.id;
      }
    }

    let typicalSpacingKm: number | null = null;
    if (stops.length === 1) {
      typicalSpacingKm = haversineDistanceKm(home, stops[0]);
    } else if (stops.length >= 2) {
      typicalSpacingKm = averagePairwiseDistanceKm(stops);
    }

    return {
      date,
      addedDistanceKm,
      totalDistanceKm,
      jobCount: stops.length,
      dayEnabled: dayHours.enabled,
      nearestExistingJobId,
      nearestExistingJobDistanceKm,
      typicalSpacingKm,
      previousNeighbor,
      nextNeighbor,
      timeFeasibility,
      timeOption: dayTimeOption,
    };
  });

  // Ranking score, not a physical distance: penalizes a day whose nearest
  // existing job is far from the new one, so a day only looking cheap
  // because the new job is close to HOME doesn't beat a day that's
  // genuinely relevant to what's already booked. A day with no existing
  // jobs at all is treated as neutral — exactly as relevant as a job
  // sitting right at the edge of CLUSTER_DISTANCE_KM — rather than as the
  // best case: a genuinely nearby job (much closer than that) should still
  // rank better than an empty day, not worse, since pairing with real
  // nearby work is the whole point.
  function rankingScore(day: DayRoute): number {
    const relevancePenaltyKm = day.nearestExistingJobDistanceKm ?? CLUSTER_DISTANCE_KM;
    return day.addedDistanceKm + PROXIMITY_TO_EXISTING_JOBS_WEIGHT * relevancePenaltyKm;
  }

  // A day is "not to be suggested" for either of two independent reasons:
  // no bookable time slot at all, or it's already at the user's own cap on
  // jobs per day — a plain count check, so unlike the time check it applies
  // no matter how the new job's time was requested (flexible, named slot,
  // or specific). Either way the day still appears in allDays rather than
  // vanishing, so "try next best" can walk onto it and explain why, and
  // manually picking it via "Different date" still works, just warns.
  function isUnbookable(day: DayRoute): boolean {
    return day.timeOption !== null && !day.timeOption.fits;
  }
  function isAtCapacity(day: DayRoute): boolean {
    return preferences.maxJobsPerDay !== null && day.jobCount >= preferences.maxJobsPerDay;
  }
  function isUnsuitableToSuggest(day: DayRoute): boolean {
    return isUnbookable(day) || isAtCapacity(day);
  }

  allDays.sort((a, b) => {
    const aBlocked = isUnsuitableToSuggest(a);
    const bBlocked = isUnsuitableToSuggest(b);
    if (aBlocked !== bBlocked) {
      return aBlocked ? 1 : -1;
    }
    return rankingScore(a) - rankingScore(b);
  });

  const suggestion = pickSuggestion(allDays, preferences);

  return { suggestion, allDays };
}

function pickSuggestion(
  allDays: DayRoute[],
  preferences: SchedulingPreferences
): DaySuggestion {
  // allDays is already sorted with proximity-to-existing-jobs weighed in,
  // so the winner here is already the best clustering-aware candidate —
  // no separate fallback search needed.
  const best = allDays[0];

  if (best.addedDistanceKm <= preferences.maxTravelRangeKm) {
    return { kind: "recommended", day: best };
  }

  const isClustered =
    best.nearestExistingJobDistanceKm !== null &&
    best.nearestExistingJobDistanceKm <= CLUSTER_DISTANCE_KM;

  if (isClustered) {
    return { kind: "clustered", day: best };
  }

  return { kind: "none", day: best };
}
