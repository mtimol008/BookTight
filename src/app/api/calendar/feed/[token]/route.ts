import { getProfileByFeedToken } from "@/lib/calendarFeed";
import { getJobsForWeekByUserId } from "@/lib/jobs";
import { deriveClockTimes, generateICalFeed, jobToICalEvent } from "@/lib/ical";
import { getCurrentWeekRange, getWeekRange } from "@/lib/week";
import { getSubscriptionByUserId } from "@/lib/subscriptions";
import { lapsedSince } from "@/lib/entitlement";

// Matches the "Your calendar feed keeps working for 30 days" line in the
// Terms — after that, the feed 404s the same as an invalid/revoked token,
// rather than a distinct error that would tell a stranger holding a stale
// link anything about why.
const CALENDAR_FEED_GRACE_DAYS = 30;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params;
  const token = rawToken.endsWith(".ics") ? rawToken.slice(0, -4) : rawToken;

  const profile = await getProfileByFeedToken(token);

  if (!profile) {
    return new Response("Not found", { status: 404 });
  }

  const subscription = await getSubscriptionByUserId(profile.id);
  const lapsedAt = lapsedSince(subscription);
  if (lapsedAt) {
    const cutoff = lapsedAt.getTime() + CALENDAR_FEED_GRACE_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() > cutoff) {
      return new Response("Not found", { status: 404 });
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { startDate } = getCurrentWeekRange();
  const { endDate: futureEndDate } = getWeekRange(startDate, 12);

  const jobs = await getJobsForWeekByUserId(profile.id, startDate, futureEndDate);

  const clockTimes = deriveClockTimes(
    { latitude: profile.home_latitude, longitude: profile.home_longitude },
    profile.working_hours,
    jobs
  );
  const events = jobs.map((job) =>
    jobToICalEvent(job, baseUrl, clockTimes.get(job.id) ?? null)
  );

  const icsContent = generateICalFeed(events, profile.timezone);

  return new Response(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      "Content-Disposition": `inline; filename="booktight-jobs.ics"`,
    },
  });
}