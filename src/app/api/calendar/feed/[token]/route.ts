import { getProfileByFeedToken } from "@/lib/calendarFeed";
import { getJobsForWeek } from "@/lib/jobs";
import { generateICalFeed, jobToICalEvent } from "@/lib/ical";
import { getCurrentWeekRange, getWeekRange } from "@/lib/week";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const profile = await getProfileByFeedToken(token);
  if (!profile) {
    return new Response("Not found", { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { startDate } = getCurrentWeekRange();
  const { endDate: futureEndDate } = getWeekRange(startDate, 12);

  const jobs = await getJobsForWeek(startDate, futureEndDate);

  const events = jobs.map((job) =>
    jobToICalEvent(job, baseUrl)
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