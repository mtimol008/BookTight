"use server";

import { geocodeAddress, searchAddresses, type AddressSuggestion } from "@/lib/geocoding";
import {
  deleteJob,
  getJobById,
  getJobsForWeek,
  insertJob,
  setJobStatuses,
  setManualPositions,
  updateJob,
  type JobRecord,
} from "@/lib/jobs";
import { getCurrentProfile, type ProfileRecord } from "@/lib/profiles";
import {
  compareManualOrder,
  dayHoursFromWorkingHours,
  isNamedSlot,
  suggestBestDay,
  formatMinutesAsClock,
  minutesToTimeValue,
  weekdayKeyOf,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  type DayHours,
  type DayRoute,
  type DaySuggestion,
  type ExistingJob,
  type JobTime,
  type ManualOrderComparison,
  type RouteNeighbor,
  type SchedulingPreferences,
  type TimeSlotType,
  type Weekday,
} from "@/lib/scheduling";
import { formatDistance, type DistanceUnit } from "@/lib/format";
import { getCurrentWeekDates, getCurrentWeekRange, getTodayDateString } from "@/lib/week";
import { revalidatePath } from "next/cache";

export interface RequestedTime {
  type: TimeSlotType;
  specificTime?: string;
}

export interface TimeSuggestion {
  /** False when the job genuinely can't be done between its neighbors —
   *  the time equivalent of the day suggestion's "no great fit". */
  fits: boolean;
  /** What gets saved if accepted. Null when it doesn't fit. */
  slot: TimeSlotType | null;
  /** "HH:MM", set only when slot === "specific". */
  specificTime: string | null;
  /** Display form: "Morning" or "11:30am". Null when it doesn't fit. */
  label: string | null;
  reasoning: string;
}

export interface SuggestionResult {
  coordinates: { latitude: number; longitude: number };
  formattedAddress: string;
  suggestion: DaySuggestion & { clusterJobLabel?: string };
  /** Only present when the requested time was "none" (flexible). */
  timeSuggestion: TimeSuggestion | null;
  allDays: DayRoute[];
  /** Carried along so the client can render the distance/capacity
   *  warnings without a second profile fetch — these are per-account
   *  settings, not part of any one day's computed route. */
  maxTravelRangeKm: number;
  maxJobsPerDay: number | null;
  distanceUnit: DistanceUnit;
}

/** The profile's stored per-day HH:MM working-hours strings and km/count
 *  settings, converted into the shape suggestBestDay expects. Falls back to
 *  the app default for any day missing from the profile's JSON (shouldn't
 *  happen post-migration, but keeps a hand-edited or partial row from
 *  crashing the app). */
function schedulingPreferencesFromProfile(profile: ProfileRecord): SchedulingPreferences {
  const workingHours = {} as Record<Weekday, DayHours>;
  for (const day of WEEKDAY_KEYS) {
    workingHours[day] = dayHoursFromWorkingHours(profile.working_hours, day);
  }

  return {
    maxTravelRangeKm: profile.max_travel_range_km,
    workingHours,
    maxJobsPerDay: profile.max_jobs_per_day,
  };
}

function jobRecordToJobTime(job: JobRecord): JobTime {
  return {
    type: job.time_slot_type as TimeSlotType,
    specificTime: job.specific_time ?? undefined,
  };
}

function shortAddressLabel(address: string): string {
  return address.split(",").slice(0, 2).join(",").trim();
}

function neighborTimeLabel(neighbor: RouteNeighbor): string {
  // Only "specific" jobs have a real clock time the user actually entered —
  // a named slot's sortKeyMinutes is just an internal anchor, never show it
  // as if it were an exact time the user set.
  if (neighbor.timeType === "specific" && neighbor.sortKeyMinutes !== null) {
    return formatMinutesAsClock(neighbor.sortKeyMinutes);
  }
  if (neighbor.timeType && neighbor.timeType !== "none") {
    return neighbor.timeType;
  }
  return "flexible-time";
}

function describeNeighbor(
  neighbor: RouteNeighbor,
  weekJobs: JobRecord[],
  distanceUnit: DistanceUnit
): string {
  const job = weekJobs.find((j) => j.id === neighbor.jobId);
  const addressLabel = job ? shortAddressLabel(job.address) : "another job";
  return `your ${neighborTimeLabel(neighbor)} job at ${addressLabel} (${formatDistance(
    neighbor.distanceKm,
    distanceUnit
  )} away)`;
}

function namedSlotLabel(slot: string): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

/** "45 minutes" / "about 6 hours" — enough to convey the scale of a gap. */
function formatApproxDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 90) {
    return `${rounded} minutes`;
  }
  return `about ${Math.round(rounded / 60)} hours`;
}

/** ["morning", "afternoon"] -> "Morning and afternoon". */
function listSlots(slots: string[]): string {
  const labels = slots.map((slot, index) =>
    index === 0 ? namedSlotLabel(slot) : slot
  );
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Turns the gap analysis from scheduling.ts into words. The arithmetic
 * deliberately lives there (next to the routing it depends on, and
 * reachable from the test script) — this function only decides how to say
 * it, since it's the layer that has the job addresses.
 */
function buildTimeSuggestion(
  day: DayRoute,
  weekJobs: JobRecord[],
  distanceUnit: DistanceUnit
): TimeSuggestion {
  const option = day.timeOption;
  if (!option) {
    return {
      fits: true,
      slot: "morning",
      specificTime: null,
      label: "Morning",
      reasoning: "No other jobs that day — any time works.",
    };
  }

  const { previousNeighbor, nextNeighbor } = option;
  const hasPrevious = !previousNeighbor.isHome;
  const hasNext = !nextNeighbor.isHome;

  if (!option.fits) {
    // Every gap in the day failed, so name the parts of the day that are
    // booked up rather than citing one arbitrary pair of jobs.
    if (option.blockedSlots.length > 0) {
      const verb = option.blockedSlots.length === 1 ? "is" : "are";
      return {
        fits: false,
        slot: null,
        specificTime: null,
        label: null,
        reasoning: `${listSlots(option.blockedSlots)} ${verb} fully booked once travel time is counted — there's no gap long enough anywhere in the day. Try another day, or set a time yourself.`,
      };
    }
    return {
      fits: false,
      slot: null,
      specificTime: null,
      label: null,
      reasoning:
        "Even a straight there-and-back trip from home doesn't fit inside the working day. Try another day, or set a time yourself.",
    };
  }

  if (!hasPrevious && !hasNext) {
    const reasoning =
      day.jobCount === 0
        ? "No other jobs that day — any time works."
        : "Nothing booked at a fixed time that day, so any time works.";
    return {
      fits: true,
      slot: option.slot ?? "morning",
      specificTime: null,
      label: namedSlotLabel(option.slot ?? "morning"),
      reasoning,
    };
  }

  const placement =
    hasPrevious && hasNext
      ? `Fits between ${describeNeighbor(previousNeighbor, weekJobs, distanceUnit)} and ${describeNeighbor(nextNeighbor, weekJobs, distanceUnit)}.`
      : hasPrevious
        ? `After ${describeNeighbor(previousNeighbor, weekJobs, distanceUnit)} — last job of the day.`
        : `Before ${describeNeighbor(nextNeighbor, weekJobs, distanceUnit)} — first job of the day.`;

  if (option.startMinutes !== null) {
    const earliest = formatMinutesAsClock(Math.round(option.earliestStartMinutes));
    const latest = formatMinutesAsClock(Math.round(option.latestStartMinutes));
    return {
      fits: true,
      slot: "specific",
      specificTime: minutesToTimeValue(option.startMinutes),
      label: formatMinutesAsClock(option.startMinutes),
      reasoning: `${placement} Only ${earliest}–${latest} works once travel time is counted, so here's an exact time rather than a rough slot.`,
    };
  }

  return {
    fits: true,
    slot: option.slot,
    specificTime: null,
    label: option.slot ? namedSlotLabel(option.slot) : null,
    reasoning: placement,
  };
}

/**
 * What to say about the time, for the time the user actually asked for.
 *
 * - Flexible ("none"): a full suggestion — the app picks the time.
 * - A named slot: nothing when it fits, since the time was already chosen
 *   and shouldn't be second-guessed. But when that slot genuinely can't
 *   happen on the day, say so — previously named slots got no feasibility
 *   check at all, so an "Afternoon" job could be dropped onto a day whose
 *   afternoon was completely full.
 * - A specific time: nothing; the travel-time conflict warning on
 *   DayRoute.timeFeasibility already covers it.
 */
function buildTimeVerdict(
  requestedTime: RequestedTime,
  day: DayRoute,
  weekJobs: JobRecord[],
  distanceUnit: DistanceUnit
): TimeSuggestion | null {
  // A day that's off blocks every request type, including "specific" —
  // which otherwise falls through to `return null` below with no warning
  // at all, since it never gets a timeOption from the gap analysis.
  if (!day.dayEnabled) {
    return {
      fits: false,
      slot: null,
      specificTime: null,
      label: null,
      reasoning: `You don't work ${WEEKDAY_LABELS[weekdayKeyOf(day.date)]}s. Try another day, or turn this day on in Account.`,
    };
  }

  if (requestedTime.type === "none") {
    return buildTimeSuggestion(day, weekJobs, distanceUnit);
  }

  if (isNamedSlot(requestedTime.type)) {
    const option = day.timeOption;
    if (!option || option.fits) {
      return null;
    }
    const slotName = namedSlotLabel(requestedTime.type);
    return {
      fits: false,
      slot: null,
      specificTime: null,
      label: null,
      reasoning: `${slotName} is full on that day once travel time is counted — there's no gap in the ${requestedTime.type} long enough for this job. Try another day, or change the time.`,
    };
  }

  return null;
}

export async function getSchedulingSuggestion(
  address: string,
  requestedTime: RequestedTime,
  excludeJobId?: string,
  durationMinutes: number | null = null
): Promise<SuggestionResult> {
  const geocoded = await geocodeAddress(address);
  if (!geocoded) {
    throw new Error(
      `Could not find coordinates for "${address}". Try a more specific address.`
    );
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error(
      "You must be logged in with a home address set to get a day suggestion."
    );
  }

  const { startDate, endDate } = getCurrentWeekRange();
  const weekJobs = await getJobsForWeek(startDate, endDate);
  // Exclude days that have already passed — the week's date range always
  // includes them (Monday through Sunday), but a day before today isn't
  // actually bookable anymore.
  const today = getTodayDateString();
  const candidateDates = getCurrentWeekDates().filter((date) => date >= today);

  const existingJobs: ExistingJob[] = weekJobs
    .filter((job) => job.id !== excludeJobId)
    .map((job) => ({
      id: job.id,
      date: job.date,
      latitude: job.latitude,
      longitude: job.longitude,
      time: jobRecordToJobTime(job),
      durationMinutes: job.duration_minutes,
      manualPosition: job.manual_position,
    }));

  const newJobTime: JobTime = {
    type: requestedTime.type,
    specificTime: requestedTime.specificTime,
  };

  const preferences = schedulingPreferencesFromProfile(profile);

  const result = suggestBestDay(
    { latitude: geocoded.latitude, longitude: geocoded.longitude },
    newJobTime,
    { latitude: profile.home_latitude, longitude: profile.home_longitude },
    candidateDates,
    existingJobs,
    preferences,
    durationMinutes
  );

  if (!result) {
    throw new Error("Could not compute a day suggestion.");
  }

  let clusterJobLabel: string | undefined;
  if (result.suggestion.kind === "clustered") {
    const clusterJob = weekJobs.find(
      (job) => job.id === result.suggestion.day.nearestExistingJobId
    );
    if (clusterJob) {
      clusterJobLabel = shortAddressLabel(clusterJob.address);
    }
  }

  const timeSuggestion = buildTimeVerdict(
    requestedTime,
    result.suggestion.day,
    weekJobs,
    profile.distance_unit
  );

  return {
    coordinates: { latitude: geocoded.latitude, longitude: geocoded.longitude },
    formattedAddress: geocoded.formattedAddress,
    suggestion: { ...result.suggestion, clusterJobLabel },
    timeSuggestion,
    allDays: result.allDays,
    maxTravelRangeKm: preferences.maxTravelRangeKm,
    maxJobsPerDay: preferences.maxJobsPerDay,
    distanceUnit: profile.distance_unit,
  };
}

/**
 * Computes the same route info as getSchedulingSuggestion, but for one
 * specific date instead of ranking across the week — used when someone
 * manually types a date that isn't already one of the pre-computed
 * candidates (e.g. outside the current week, or a past date being kept on
 * an existing job). Takes coordinates directly rather than an address,
 * since geocoding already happened as part of the initial suggestion.
 */
export async function getDayRouteInfo(
  coordinates: { latitude: number; longitude: number },
  requestedTime: RequestedTime,
  date: string,
  excludeJobId?: string,
  durationMinutes: number | null = null
): Promise<DayRoute> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error(
      "You must be logged in with a home address set to get a day suggestion."
    );
  }

  const dayJobs = await getJobsForWeek(date, date);

  const existingJobs: ExistingJob[] = dayJobs
    .filter((job) => job.id !== excludeJobId)
    .map((job) => ({
      id: job.id,
      date: job.date,
      latitude: job.latitude,
      longitude: job.longitude,
      time: jobRecordToJobTime(job),
      durationMinutes: job.duration_minutes,
      manualPosition: job.manual_position,
    }));

  const newJobTime: JobTime = {
    type: requestedTime.type,
    specificTime: requestedTime.specificTime,
  };

  const result = suggestBestDay(
    coordinates,
    newJobTime,
    { latitude: profile.home_latitude, longitude: profile.home_longitude },
    [date],
    existingJobs,
    schedulingPreferencesFromProfile(profile),
    durationMinutes
  );

  if (!result) {
    throw new Error("Could not compute route info for that date.");
  }

  return result.allDays[0];
}

/**
 * Computes a fresh time suggestion for one specific date — used when the
 * selected day changes (a different top candidate, or a manually-picked
 * date) so the "best time" reasoning stays tied to whichever day is
 * actually selected, instead of only ever describing the original top
 * pick. Always evaluates as if flexible time was requested ("none"),
 * since that's the only case a time suggestion makes sense for — this
 * mirrors the same gate used in getSchedulingSuggestion.
 */
export async function getDayTimeSuggestion(
  coordinates: { latitude: number; longitude: number },
  requestedTime: RequestedTime,
  date: string,
  excludeJobId?: string,
  durationMinutes: number | null = null
): Promise<TimeSuggestion | null> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error(
      "You must be logged in with a home address set to get a day suggestion."
    );
  }

  const dayJobs = await getJobsForWeek(date, date);

  const existingJobs: ExistingJob[] = dayJobs
    .filter((job) => job.id !== excludeJobId)
    .map((job) => ({
      id: job.id,
      date: job.date,
      latitude: job.latitude,
      longitude: job.longitude,
      time: jobRecordToJobTime(job),
      durationMinutes: job.duration_minutes,
      manualPosition: job.manual_position,
    }));

  const result = suggestBestDay(
    coordinates,
    { type: requestedTime.type, specificTime: requestedTime.specificTime },
    { latitude: profile.home_latitude, longitude: profile.home_longitude },
    [date],
    existingJobs,
    schedulingPreferencesFromProfile(profile),
    durationMinutes
  );

  if (!result) {
    throw new Error("Could not compute a time suggestion for that date.");
  }

  return buildTimeVerdict(requestedTime, result.allDays[0], dayJobs, profile.distance_unit);
}

export async function getAddressSuggestions(
  query: string
): Promise<AddressSuggestion[]> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return searchAddresses(query);
  }

  return searchAddresses(query, {
    proximity: [profile.home_longitude, profile.home_latitude],
  });
}

export interface ConfirmJobInput {
  address: string;
  latitude: number;
  longitude: number;
  date: string;
  timeSlotType: string;
  specificTime: string | null;
  customerName: string;
  description: string;
  durationMinutes: number | null;
}

export async function confirmAndSaveJob(input: ConfirmJobInput): Promise<void> {
  if (input.date < getTodayDateString()) {
    throw new Error("Can't book a job on a date that's already passed.");
  }

  await insertJob({
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    date: input.date,
    time_slot_type: input.timeSlotType,
    specific_time: input.specificTime,
    customer_name: input.customerName,
    description: input.description,
    duration_minutes: input.durationMinutes,
  });

  revalidatePath("/");
}

export interface UpdateJobFormInput {
  id: string;
  address: string;
  date: string;
  timeSlotType: string;
  specificTime: string | null;
  customerName: string;
  description: string;
  durationMinutes: number | null;
}

export async function updateExistingJob(
  input: UpdateJobFormInput
): Promise<void> {
  // Re-geocode on every edit (not just when the address looks different) so
  // stored coordinates never drift out of sync with the address text.
  const geocoded = await geocodeAddress(input.address);
  if (!geocoded) {
    throw new Error(
      `Could not find coordinates for "${input.address}". Try a more specific address.`
    );
  }

  // A manual_position only means something relative to the siblings it was
  // set among — moving to a different day or time-of-day makes the old
  // number meaningless, so it resets rather than silently carrying over
  // into an unrelated group. Read the job fresh rather than trusting
  // whatever the client last had, since it may be stale.
  const current = await getJobById(input.id);

  // Only reject a date that's actually changing to a past one — a job
  // already sitting on an earlier date this week (not yet reviewed) still
  // needs to be editable without moving it, which is exactly the "keep
  // current date" case the day-suggestion panel already supports.
  if (input.date !== current?.date && input.date < getTodayDateString()) {
    throw new Error("Can't move a job to a date that's already passed.");
  }

  const movedGroups =
    !!current &&
    (current.date !== input.date || current.time_slot_type !== input.timeSlotType);

  await updateJob(input.id, {
    address: geocoded.formattedAddress,
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
    date: input.date,
    time_slot_type: input.timeSlotType,
    specific_time: input.specificTime,
    customer_name: input.customerName,
    description: input.description,
    duration_minutes: input.durationMinutes,
    ...(movedGroups ? { manual_position: null } : {}),
  });

  revalidatePath("/");
}

/**
 * The cost of a proposed manual reorder — called once when a within-section
 * drag is dropped, before anything is saved, so the caller can decide
 * whether to warn ("this adds ~X km") before committing to it.
 */
export async function getManualOrderImpact(
  date: string,
  proposedOrder: string[]
): Promise<ManualOrderComparison> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("You must be logged in with a home address set to check a reorder.");
  }

  const dayJobs = await getJobsForWeek(date, date);
  const existingJobs: ExistingJob[] = dayJobs.map((job) => ({
    id: job.id,
    date: job.date,
    latitude: job.latitude,
    longitude: job.longitude,
    time: jobRecordToJobTime(job),
    durationMinutes: job.duration_minutes,
    manualPosition: job.manual_position,
  }));

  return compareManualOrder(
    { latitude: profile.home_latitude, longitude: profile.home_longitude },
    existingJobs,
    proposedOrder
  );
}

/** Persists a within-section drag-reorder once confirmed. */
export async function saveManualOrder(proposedOrder: string[]): Promise<void> {
  await setManualPositions(proposedOrder.map((id, index) => ({ id, position: index })));
  revalidatePath("/");
}

export async function deleteExistingJob(id: string): Promise<void> {
  await deleteJob(id);
  revalidatePath("/");
}

/** End-of-day review: the jobs that got done. */
export async function markJobsCompleted(ids: string[]): Promise<void> {
  await setJobStatuses(ids, "completed");
  revalidatePath("/");
  revalidatePath("/review", "layout");
}

/**
 * End-of-day review: a job that isn't happening. The row is kept rather
 * than deleted — it just stops appearing in the active view — so this
 * stays recoverable if an undo is ever wanted.
 */
export async function markJobCancelled(id: string): Promise<void> {
  await setJobStatuses([id], "cancelled");
  revalidatePath("/");
  revalidatePath("/review", "layout");
}
