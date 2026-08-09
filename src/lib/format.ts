// Display formatting for dates. Parsed as local time deliberately —
// new Date("2026-08-03") is treated as UTC and can render as the previous
// day west of Greenwich, which is exactly the off-by-one the rest of the
// app already avoids in week.ts.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Monday-first single-letter header row for a month grid. */
export const MONTH_GRID_WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function parseLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** "2026-08-03" -> "Aug 3" */
export function formatShortDate(isoDate: string): string {
  const date = parseLocalDate(isoDate);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "2026-08-03", "2026-08-09" -> "Aug 3 – Aug 9" */
export function formatDateRange(startIso: string, endIso: string): string {
  return `${formatShortDate(startIso)} – ${formatShortDate(endIso)}`;
}

/** "2026-08-03" -> "MON 08-03", the day-card heading. */
export function formatDayHeading(isoDate: string): string {
  const date = parseLocalDate(isoDate);
  const [, month, day] = isoDate.split("-");
  return `${WEEKDAYS[date.getDay()].toUpperCase()} ${month}-${day}`;
}

/** "2026-08-05" -> "AUG 5", used in the review screen title. */
export function formatDayTitle(isoDate: string): string {
  const date = parseLocalDate(isoDate);
  return `${MONTHS[date.getMonth()].toUpperCase()} ${date.getDate()}`;
}

export type DistanceUnit = "km" | "mi";
const MILES_PER_KILOMETER = 0.621371;

export function distanceKmToUnit(distanceKm: number, unit: DistanceUnit): number {
  return unit === "mi" ? distanceKm * MILES_PER_KILOMETER : distanceKm;
}

export function formatDistance(
  distanceKm: number | null,
  unit: DistanceUnit = "km"
): string {
  if (distanceKm === null) {
    return "";
  }
  const value = distanceKmToUnit(distanceKm, unit);
  return `${value.toFixed(1)} ${unit}`;
}

/** "2026-08-03" -> "Mon, Aug 3", used in suggestion headlines. */
export function formatSuggestionDate(isoDate: string): string {
  const date = parseLocalDate(isoDate);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "2026-08-01" (any day in the month works) -> "August 2026" */
export function formatMonthTitle(isoDate: string): string {
  const date = parseLocalDate(isoDate);
  return `${FULL_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
