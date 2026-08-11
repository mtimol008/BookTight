// Computes the Monday-Sunday range containing a given date, in local time
// (not UTC — avoids off-by-one-day bugs from toISOString()).

export interface WeekRange {
  startDate: string; // "YYYY-MM-DD", Monday
  endDate: string; // "YYYY-MM-DD", Sunday
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonday(referenceDate: Date): Date {
  const dayOfWeek = referenceDate.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() + diffToMonday);
  return monday;
}

export function getCurrentWeekRange(referenceDate: Date = new Date()): WeekRange {
  const monday = getMonday(referenceDate);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return { startDate: toISODate(monday), endDate: toISODate(sunday) };
}

/** Every date (Monday through Sunday) in the week containing referenceDate. */
export function getCurrentWeekDates(referenceDate: Date = new Date()): string[] {
  const monday = getMonday(referenceDate);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return toISODate(day);
  });
}

/** Today's date as "YYYY-MM-DD", in local time. */
export function getTodayDateString(referenceDate: Date = new Date()): string {
  return toISODate(referenceDate);
}

export interface MonthRange {
  startDate: string; // "YYYY-MM-DD", 1st of the month
  endDate: string; // "YYYY-MM-DD", last day of the month
}

/** Every date in the month containing referenceDate, 1st through last. */
export function getMonthDates(referenceDate: Date = new Date()): string[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) =>
    toISODate(new Date(year, month, i + 1))
  );
}

export function getMonthRange(referenceDate: Date = new Date()): MonthRange {
  const dates = getMonthDates(referenceDate);
  return { startDate: dates[0], endDate: dates[dates.length - 1] };
}

/** How many blank cells to lead a month's grid with, so the 1st lands in
 *  the correct weekday column — grids start Monday, matching how the rest
 *  of the app treats a week. */
export function getMonthLeadingBlankCells(referenceDate: Date = new Date()): number {
  const dayOfWeek = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1
  ).getDay(); // 0 = Sunday, 1 = Monday, ...
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

/** "2026-08" -> the 1st of that month, in local time. Falls back to the
 *  current month for a missing or malformed query param. */
export function parseMonthParam(monthParam: string | undefined): Date {
  if (monthParam) {
    const [year, month] = monthParam.split("-").map(Number);
    if (year && month && month >= 1 && month <= 12) {
      return new Date(year, month - 1, 1);
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** The 1st of the month -> "2026-08", the ?month= query param form. */
export function formatMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The 1st of the month, shifted by whole months (negative goes back). */
export function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** Week range starting from a given Monday, spanning N weeks. */
export function getWeekRange(startMonday: string, weeks: number): WeekRange {
  const start = new Date(startMonday + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + weeks * 7 - 1);
  return {
    startDate: startMonday,
    endDate: toISODate(end),
  };
}
