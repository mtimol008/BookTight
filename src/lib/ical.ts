import type { JobRecord } from "./jobs";
import {
  planDayClockTimes,
  weekdayKeyOf,
  dayHoursFromWorkingHours,
  type Coordinates,
  type ExistingJob,
  type PlannedClockTime,
  type StoredDayHours,
  type TimeSlotType,
  type Weekday,
} from "./scheduling";
import { zonedWallTimeToUtc } from "./week";

export interface ICalEvent {
  uid: string;
  dtStart: Date;
  dtEnd: Date;
  summary: string;
  location: string;
  description: string;
  url: string;
  sequence: number;
  isAllDay: boolean;
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

/** All-day VALUE=DATE calendar dates and the UTC DTSTAMP timestamp need
 *  different readings of the same Date object: an all-day date is built
 *  from local midnight (see jobToICalEvent), so it has to be read back with
 *  local getters — or a positive UTC offset silently shifts it back a
 *  calendar day. DTSTAMP is a real UTC instant, so it correctly stays on
 *  UTC getters. Timed events are formatted separately, via
 *  formatICalDateTimeLocal's Intl-based, timezone-aware reading. */
function formatICalDate(date: Date, isAllDay: boolean): string {
  if (isAllDay) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * `date` is a real UTC instant (see jobToICalEvent/zonedWallTimeToUtc) —
 * this reads it back as the wall-clock time it represents IN `timezone`,
 * via Intl, rather than process-local getters. Process-local getters would
 * read Vercel's own UTC runtime clock, not the TZID this string is
 * actually labelled with — the exact mismatch that let exported times
 * drift an hour around a DST transition.
 */
function formatICalDateTimeLocal(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function getVTIMEZONE(timezone: string): string {
  return `BEGIN:VTIMEZONE
TZID:${timezone}
X-LIC-LOCATION:${timezone}
END:VTIMEZONE`;
}

export function generateICalFeed(
  events: ICalEvent[],
  timezone: string,
  prodId: string = "-//Booktight//Job Schedule//EN"
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Booktight Jobs`,
    `X-WR-TIMEZONE:${timezone}`,
  ];

  const uniqueTimezones = new Set<string>();
  for (const event of events) {
    if (!event.isAllDay) {
      uniqueTimezones.add(timezone);
    }
  }
  for (const tz of uniqueTimezones) {
    lines.push(getVTIMEZONE(tz));
  }

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`SEQUENCE:${event.sequence}`);
    lines.push(`DTSTAMP:${formatICalDate(new Date(), false)}`);

    if (event.isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatICalDate(event.dtStart, true)}`);
      lines.push(`DTEND;VALUE=DATE:${formatICalDate(event.dtEnd, true)}`);
    } else {
      lines.push(`DTSTART;TZID=${timezone}:${formatICalDateTimeLocal(event.dtStart, timezone)}`);
      lines.push(`DTEND;TZID=${timezone}:${formatICalDateTimeLocal(event.dtEnd, timezone)}`);
    }

    lines.push(`SUMMARY:${escapeICalText(event.summary)}`);
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
    lines.push(`URL:${event.url}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}

/**
 * Groups a set of jobs by date and runs planDayClockTimes on each day, so
 * every timed job gets a real, sequential, non-overlapping start/end
 * derived from that day's actual route — instead of every job sharing its
 * slot's flat placeholder hour (the old behavior, and the reason two
 * "Morning" jobs used to export at the identical time). Flexible ("none")
 * and all-day jobs still come through here — their real position and
 * duration still have to occupy time in the chain so jobs after them land
 * correctly (relevant for an all-day job only in the unusual case where an
 * override let it share a day with something else) — but jobToICalEvent
 * below deliberately ignores their own entry and keeps them as an all-day
 * event: a flexible job never had a real time chosen for it, and an
 * all-day job's whole point is that it isn't a clock-time event.
 */
export function deriveClockTimes(
  home: Coordinates,
  workingHours: Record<Weekday, StoredDayHours>,
  jobs: JobRecord[]
): Map<string, PlannedClockTime> {
  const byDate = new Map<string, JobRecord[]>();
  for (const job of jobs) {
    const dateJobs = byDate.get(job.date) ?? [];
    dateJobs.push(job);
    byDate.set(job.date, dateJobs);
  }

  const result = new Map<string, PlannedClockTime>();
  for (const [date, dateJobs] of byDate) {
    const dayHours = dayHoursFromWorkingHours(workingHours, weekdayKeyOf(date));
    const existingJobs: ExistingJob[] = dateJobs.map((job) => ({
      id: job.id,
      date: job.date,
      latitude: job.latitude,
      longitude: job.longitude,
      time: {
        type: job.time_slot_type as TimeSlotType,
        specificTime: job.specific_time ?? undefined,
      },
      durationMinutes: job.duration_minutes,
      manualPosition: job.manual_position,
    }));

    for (const clockTime of planDayClockTimes(home, dayHours, existingJobs)) {
      result.set(clockTime.jobId, clockTime);
    }
  }

  return result;
}

/** Longest an event title gets, in characters, including the ellipsis. */
export const SUMMARY_MAX_LENGTH = 60;

/**
 * The calendar event's title: "Customer — first line of description",
 * cut to SUMMARY_MAX_LENGTH with "…". Calendar apps show SUMMARY in a
 * small box (and a multi-line description used to give events multi-line
 * titles), so the full text goes in DESCRIPTION instead. Counts by
 * Unicode code point, so an emoji is never cut in half.
 */
export function buildEventSummary(customerName: string, description: string | null | undefined): string {
  const firstLine =
    (description ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const full = firstLine ? `${customerName.trim()} — ${firstLine}` : customerName.trim();

  const chars = Array.from(full);
  if (chars.length <= SUMMARY_MAX_LENGTH) {
    return full;
  }
  return chars.slice(0, SUMMARY_MAX_LENGTH - 1).join("").trimEnd() + "…";
}

export function jobToICalEvent(
  job: JobRecord,
  baseUrl: string,
  clockTime: PlannedClockTime | null,
  timezone: string
): ICalEvent {
  let dtStart: Date;
  let dtEnd: Date;
  let isAllDay = false;

  if (job.time_slot_type === "none" || job.time_slot_type === "all_day" || !clockTime) {
    // All-day events are pure calendar dates, with no clock-time
    // component to get wrong across a DST transition — plain local-date
    // arithmetic (unaffected by the server's own runtime timezone) is
    // correct here, same as every other day-level date in this codebase.
    isAllDay = true;
    dtStart = new Date(job.date + "T00:00:00");
    dtEnd = new Date(dtStart);
    dtEnd.setDate(dtEnd.getDate() + 1);
  } else {
    // Timed events DO have a real clock time that must survive a DST
    // transition correctly — computed via the same Intl-based,
    // timezone-aware arithmetic week.ts already uses for "today"/"now",
    // rather than raw local-Date overflow (which used the server's own
    // runtime timezone, not the profile's, and drifted an hour around the
    // UK's spring/autumn clock change).
    dtStart = zonedWallTimeToUtc(job.date, clockTime.startMinutes, timezone);
    dtEnd = zonedWallTimeToUtc(job.date, clockTime.endMinutes, timezone);
  }

  const summary = buildEventSummary(job.customer_name, job.description);

  // The full description (every line of it) lives here, not in SUMMARY.
  const descriptionLines = [];
  if (job.description) {
    descriptionLines.push(job.description);
  }
  descriptionLines.push(`Address: ${job.address}`);
  descriptionLines.push(`Booktight job #${job.id.slice(0, 8)}`);

  return {
    uid: `job-${job.id}@booktight`,
    dtStart,
    dtEnd,
    summary,
    location: job.address,
    description: descriptionLines.join("\n"),
    url: `${baseUrl.replace(/\/$/, "")}/review/${job.date}#${job.id}`,
    sequence: 0,
    isAllDay,
  };
}