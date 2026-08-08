import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DayReview } from "@/components/DayReview";
import { BackIcon } from "@/components/icons";
import { formatDayTitle } from "@/lib/format";
import { getScheduledJobsForDate } from "@/lib/jobs";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const jobs = await getScheduledJobsForDate(date);

  // Nothing left awaiting a decision — either the day is already reviewed
  // or the URL was made up. Either way there's nothing to show.
  if (jobs.length === 0) {
    redirect("/");
  }

  return (
    <AppShell>
      <div className="screen-head screen-head--center">
        <Link href="/" className="back-link" aria-label="Back to this week">
          <BackIcon />
        </Link>
        <h1 className="screen-title">Review {formatDayTitle(date)}</h1>
      </div>

      <DayReview date={date} jobs={jobs} />
    </AppShell>
  );
}
