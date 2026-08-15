import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AccountCircleIcon, PlusIcon } from "@/components/icons";
import JobsTableClient from "@/components/JobsTableClient";
import type { DayPlan } from "@/components/JobsTable";
import { formatDateRange, formatShortDate } from "@/lib/format";
import {
  getDayReviewStatus,
  getJobsForWeek,
  getUnreviewedSummary,
  type JobRecord,
} from "@/lib/jobs";
import { getCurrentProfile } from "@/lib/profiles";
import { planDayRoute, type ExistingJob, type TimeSlotType } from "@/lib/scheduling";
import { getCurrentWeekRange } from "@/lib/week";

/**
 * Groups the week's jobs by day and puts each day's jobs into the order
 * they should actually be driven, using the same route logic the
 * scheduling suggestions run on. Without a home address there's no anchor
 * for a route, so the jobs are still listed — just without an order or
 * distances.
 */
function buildDayPlans(
  jobs: JobRecord[],
  home: { latitude: number; longitude: number } | null
): DayPlan[] {
  const byDate = new Map<string, JobRecord[]>();
  for (const job of jobs) {
    const forDate = byDate.get(job.date) ?? [];
    forDate.push(job);
    byDate.set(job.date, forDate);
  }

  const dates = Array.from(byDate.keys()).sort();

  return dates.map((date) => {
    const dayJobs = byDate.get(date) as JobRecord[];

    if (!home) {
      return {
        date,
        stops: dayJobs.map((job) => ({
          job,
          distanceFromPreviousKm: null,
          cumulativeDistanceKm: null,
        })),
        returnHomeKm: null,
        totalDistanceKm: null,
        reviewStatus: getDayReviewStatus(date, dayJobs),
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
      date,
      stops: route.stops.map((stop) => ({
        job: jobsById.get(stop.jobId) as JobRecord,
        distanceFromPreviousKm: stop.distanceFromPreviousKm,
        cumulativeDistanceKm: stop.cumulativeDistanceKm,
      })),
      returnHomeKm: route.returnHomeKm,
      totalDistanceKm: route.totalDistanceKm,
      reviewStatus: getDayReviewStatus(date, dayJobs),
    };
  });
}

export default async function Home() {
  const { startDate, endDate } = getCurrentWeekRange();
  const [jobs, profile, unreviewed] = await Promise.all([
    getJobsForWeek(startDate, endDate),
    getCurrentProfile(),
    getUnreviewedSummary(),
  ]);

  // The one entry point sign-in already redirects to — gating here (rather
  // than on every route) means onboarding always runs before the app
  // proper, without needing a guard on every single page.
  if (profile && !profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const home = profile
    ? { latitude: profile.home_latitude, longitude: profile.home_longitude }
    : null;
  const days = buildDayPlans(jobs, home);

  return (
    <AppShell>
      <div className="screen-head">
        <div>
          <div className="wordmark">Booktight</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {formatDateRange(startDate, endDate)}
          </div>
        </div>
        <Link href="/account" className="icon-btn" aria-label="Account">
          <AccountCircleIcon />
        </Link>
      </div>

      {/* Always the oldest unreviewed day, so clearing one reveals the
          next and a backlog works through itself a day at a time. */}
      {unreviewed && (
        <div className="banner" style={{ marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="banner-title">
              {unreviewed.jobCount} job{unreviewed.jobCount === 1 ? "" : "s"} unreviewed
            </div>
            <div className="banner-sub">
              {formatShortDate(unreviewed.date)} — check what&apos;s done
            </div>
          </div>
          <Link
            href={`/review/${unreviewed.date}`}
            className="btn btn--warning btn--sm btn--pill"
          >
            Review
          </Link>
        </div>
      )}

      {!home && jobs.length > 0 && (
        <p className="note" style={{ marginTop: 16 }}>
          Set a home address to see each day in driving order with distances.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <JobsTableClient days={days} distanceUnit={profile?.distance_unit ?? "km"} />
      </div>
      <Link href="/add" className="fab" aria-label="Add a job">
        <PlusIcon />
      </Link>
    </AppShell>
  );
}
