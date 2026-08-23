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
  getTotalJobCount,
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

/** How many days to give a new account before the stall nudge appears —
 *  zero jobs booked by then, not just zero jobs this particular week. */
const STALL_NUDGE_DELAY_DAYS = 3;

/** referenceNow as a default parameter (matching getTodayDateString's own
 *  pattern in week.ts) rather than a bare Date.now() inline in the
 *  component body, which React's purity check flags as an impure render
 *  call. */
function daysSince(isoTimestamp: string, referenceNow: Date = new Date()): number {
  return (referenceNow.getTime() - new Date(isoTimestamp).getTime()) / 86_400_000;
}

export default async function Home() {
  const { startDate, endDate } = getCurrentWeekRange();
  const [jobs, profile, unreviewed, totalJobCount] = await Promise.all([
    getJobsForWeek(startDate, endDate),
    getCurrentProfile(),
    getUnreviewedSummary(),
    getTotalJobCount(),
  ]);

  // The one entry point sign-in already redirects to — gating here (rather
  // than on every route) means onboarding always runs before the app
  // proper, without needing a guard on every single page. Same reasoning
  // extends to the post-onboarding entry choice: every existing account
  // defaults to entryChoiceMade being unset too (nothing backfills it —
  // see the engagement_state migration), so this rolls out uniformly
  // rather than only to new signups.
  if (profile && !profile.onboarding_completed_at) {
    redirect("/onboarding");
  }
  if (profile && !profile.engagement_state?.entryChoiceMade) {
    redirect("/welcome");
  }

  const home = profile
    ? { latitude: profile.home_latitude, longitude: profile.home_longitude }
    : null;
  const days = buildDayPlans(jobs, home);

  // Zero jobs EVER, not zero jobs this week — a light week is completely
  // normal for an account in active use and must never trigger this; only
  // "never once used Add a Job" should. No dismiss/tracking state: it just
  // stops appearing the moment a job exists, same as the unreviewed banner.
  const daysSinceOnboarding = profile?.onboarding_completed_at
    ? daysSince(profile.onboarding_completed_at)
    : 0;
  const showStallNudge =
    totalJobCount === 0 && daysSinceOnboarding >= STALL_NUDGE_DELAY_DAYS;

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

      {showStallNudge && (
        <div className="banner" style={{ marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="banner-title">Nothing booked yet</div>
            <div className="banner-sub">
              Add your first job and it&apos;ll show up here.
            </div>
          </div>
          <Link href="/add" className="btn btn--warning btn--sm btn--pill">
            Add a job
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
