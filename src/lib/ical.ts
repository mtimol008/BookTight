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
 *  local getters — the same convention formatICalDateTimeLocal already uses
 *  for timed events — or a positive UTC offset silently shifts it back a
 *  calendar day. DTSTAMP is a real UTC instant, so it correctly stays on
 *  UTC getters. */
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

function formatICalDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
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
      lines.push(`DTSTART;TZID=${timezone}:${formatICalDateTimeLocal(event.dtStart)}`);
      lines.push(`DTEND;TZID=${timezone}:${formatICalDateTimeLocal(event.dtEnd)}`);
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
 * jobs still come through here — their real position and duration still
 * have to occupy time in the chain so jobs after them land correctly — but
 * jobToICalEvent below deliberately ignores their entry and keeps them as
 * an all-day event, since no real time was ever chosen for them.
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

export function jobToICalEvent(
  job: JobRecord,
  baseUrl: string,
  clockTime: PlannedClockTime | null
): ICalEvent {
  const jobDate = new Date(job.date + "T00:00:00");
  let dtStart: Date;
  let dtEnd: Date;
  let isAllDay = false;

  if (job.time_slot_type === "none" || !clockTime) {
    isAllDay = true;
    dtStart = new Date(jobDate);
    dtEnd = new Date(jobDate);
    dtEnd.setDate(dtEnd.getDate() + 1);
  } else {
    dtStart = new Date(jobDate);
    dtStart.setMinutes(clockTime.startMinutes);
    dtEnd = new Date(jobDate);
    dtEnd.setMinutes(clockTime.endMinutes);
  }

  const summaryParts = [job.customer_name];
  if (job.description) {
    summaryParts.push(job.description);
  }
  const summary = summaryParts.join(" — ");

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
    description: descriptionLines.join("\\n"),
    url: `${baseUrl.replace(/\/$/, "")}/review/${job.date}#${job.id}`,
    sequence: 0,
    isAllDay,
  };
}