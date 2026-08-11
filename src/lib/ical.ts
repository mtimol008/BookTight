import type { JobRecord } from "./jobs";

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

function formatICalDate(date: Date, isAllDay: boolean): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  if (isAllDay) {
    return `${year}${month}${day}`;
  }

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

export function jobToICalEvent(
  job: JobRecord,
  baseUrl: string
): ICalEvent {
  const jobDate = new Date(job.date + "T00:00:00");
  let dtStart: Date;
  let dtEnd: Date;
  let isAllDay = false;

  const durationMinutes = job.duration_minutes ?? 60;

  if (job.time_slot_type === "none" || job.time_slot_type === "flexible") {
    isAllDay = true;
    dtStart = new Date(jobDate);
    dtEnd = new Date(jobDate);
    dtEnd.setDate(dtEnd.getDate() + 1);
  } else if (job.time_slot_type === "specific" && job.specific_time) {
    const [hours, minutes] = job.specific_time.split(":").map(Number);
    dtStart = new Date(jobDate);
    dtStart.setHours(hours, minutes, 0, 0);
    dtEnd = new Date(dtStart);
    dtEnd.setMinutes(dtEnd.getMinutes() + durationMinutes);
  } else {
    const slotStartHours = getNamedSlotStartHours(job.time_slot_type);
    dtStart = new Date(jobDate);
    dtStart.setHours(slotStartHours, 0, 0, 0);
    dtEnd = new Date(dtStart);
    dtEnd.setMinutes(dtEnd.getMinutes() + durationMinutes);
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

function getNamedSlotStartHours(slot: string): number {
  switch (slot) {
    case "morning":
      return 9;
    case "afternoon":
      return 13;
    case "evening":
      return 17;
    case "night":
      return 20;
    default:
      return 9;
  }
}