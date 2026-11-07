import * as Sentry from "@sentry/nextjs";
import { runDeletionWarningsJob } from "@/lib/deletionWarnings";

export const dynamic = "force-dynamic";

/**
 * Runs once a day via the "crons" entry in vercel.json. Vercel sends every
 * cron request with this exact header — checked here rather than trusting
 * the path alone, since the route is otherwise a public URL.
 *
 * ?dryRun=true runs every read and decision with no writes at all (no
 * email sent, no lapsed_at set/cleared, no warning claimed, no account
 * deleted) — for a manual check against real data with no side effects.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";

  try {
    const summary = await runDeletionWarningsJob({ dryRun });
    const status = summary.errors > 0 ? 207 : 200;
    return Response.json({ dryRun, ...summary }, { status });
  } catch (err) {
    Sentry.captureException(err, { tags: { job: "deletion-warning-cron", stage: "run" } });
    return new Response("Deletion-warning cron run failed", { status: 500 });
  }
}
