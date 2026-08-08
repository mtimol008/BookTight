import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DayRouteSummary, type DayRouteSummaryStop } from "@/components/DayRouteSummary";
import { BackIcon, ForwardIcon } from "@/components/icons";
import { MONTH_GRID_WEEKDAY_LABELS, formatMonthTitle } from "@/lib/format";
import { getJobsForWeek, type JobRecord } from "@/lib/jobs";
import { getCurrentProfile } from "@/lib/profiles";
import { planDayRoute, type ExistingJob, type TimeSlotType } from "@/lib/scheduling";
import {
  formatMonthParam,
  getMonthDates,
  getMonthLeadingBlankCells,
  getMonthRange,
  getTodayDateString,
  parseMonthParam,
  shiftMonth,
} from "@/lib/week";

/** A day's real visit order via the same planDayRoute the This Week and
 *  Add a Job flows already use — no home means no anchor for a route, so
 *  the day's jobs are listed unordered instead, same fallback page.tsx
 *  already uses for the same reason. */
function buildSelectedDayStops(
  dayJobs: JobRecord[],
  home: { latitude: number; longitude: number } | null
): { stops: DayRouteSummaryStop[]; returnHomeKm: number | null; totalDistanceKm: number | null } {
  if (!home) {
    return {
      stops: dayJobs.map((job) => ({
        job,
        distanceFromPreviousKm: null,
        cumulativeDistanceKm: null,
      })),
      returnHomeKm: null,
      totalDistanceKm: null,
    };
  }

  const existingJobs: ExistingJob[] = dayJobs.map((job) => ({
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

  const route = planDayRoute(home, existingJobs);
  const jobsById = new Map(dayJobs.map((job) => [job.id, job]));

  return {
    stops: route.stops.map((stop) => ({
      job: jobsById.get(stop.jobId) as JobRecord,
      distanceFromPreviousKm: stop.distanceFromPreviousKm,
      cumulativeDistanceKm: stop.cumulativeDistanceKm,
    })),
    returnHomeKm: route.returnHomeKm,
    totalDistanceKm: route.totalDistanceKm,
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string }>;
}) {
  const { month: monthParam, date: dateParam } = await searchParams;
  const monthDate = parseMonthParam(monthParam);
  const { startDate, endDate } = getMonthRange(monthDate);
  const monthDates = getMonthDates(monthDate);
  const leadingBlanks = getMonthLeadingBlankCells(monthDate);
  const monthParamValue = formatMonthParam(monthDate);

  const [jobs, profile] = await Promise.all([
    getJobsForWeek(startDate, endDate),
    getCurrentProfile(),
  ]);

  const today = getTodayDateString();
  // Whatever was tapped, as long as it's actually in the shown month;
  // otherwise today if today falls in this month; otherwise nothing
  // selected — a month with no natural default just shows the grid alone.
  const selectedDate =
    dateParam && monthDates.includes(dateParam)
      ? dateParam
      : monthDates.includes(today)
        ? today
        : null;

  const jobsByDate = new Map<string, JobRecord[]>();
  for (const job of jobs) {
    const forDate = jobsByDate.get(job.date) ?? [];
    forDate.push(job);
    jobsByDate.set(job.date, forDate);
  }

  const home = profile
    ? { latitude: profile.home_latitude, longitude: profile.home_longitude }
    : null;

  const selectedDayJobs = selectedDate ? jobsByDate.get(selectedDate) ?? [] : [];
  const { stops, returnHomeKm, totalDistanceKm } = buildSelectedDayStops(
    selectedDayJobs,
    home
  );

  const prevMonthHref = `/calendar?month=${formatMonthParam(shiftMonth(monthDate, -1))}`;
  const nextMonthHref = `/calendar?month=${formatMonthParam(shiftMonth(monthDate, 1))}`;

  return (
    <AppShell>
      <div className="screen-head">
        <div className="wordmark">Booktight</div>
      </div>

      <div className="month-nav" style={{ marginTop: 16 }}>
        <Link href={prevMonthHref} className="icon-btn" aria-label="Previous month">
          <BackIcon />
        </Link>
        <span className="month-title">{formatMonthTitle(startDate)}</span>
        <Link href={nextMonthHref} className="icon-btn" aria-label="Next month">
          <ForwardIcon />
        </Link>
      </div>

      <div className="month-legend">
        <span className="month-legend-item">
          <span className="month-cell-dot" /> Light day
        </span>
        <span className="month-legend-item">
          <span className="month-cell-dot month-cell-dot--packed" /> Packed day
        </span>
      </div>

      <div className="month-grid">
        {MONTH_GRID_WEEKDAY_LABELS.map((label, index) => (
          <div key={index} className="month-weekday">
            {label}
          </div>
        ))}

        {Array.from({ length: leadingBlanks }).map((_, index) => (
          <div key={`blank-${index}`} className="month-cell month-cell--empty" />
        ))}

        {monthDates.map((date) => {
          const count = jobsByDate.get(date)?.length ?? 0;
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const dayNumber = Number(date.slice(-2));

          return (
            <Link
              key={date}
              href={`/calendar?month=${monthParamValue}&date=${date}`}
              className={`month-cell${isToday ? " month-cell--today" : ""}${
                isSelected ? " month-cell--selected" : ""
              }`}
            >
              {dayNumber}
              {count > 0 && (
                <span
                  className={`month-cell-dot${count >= 3 ? " month-cell-dot--packed" : ""}`}
                />
              )}
            </Link>
          );
        })}
      </div>

      {!home && jobs.length > 0 && (
        <p className="note" style={{ marginTop: 16 }}>
          Set a home address on Account to see routes with distances.
        </p>
      )}

      {selectedDate && (
        <DayRouteSummary
          date={selectedDate}
          stops={stops}
          returnHomeKm={returnHomeKm}
          totalDistanceKm={totalDistanceKm}
        />
      )}
    </AppShell>
  );
}
