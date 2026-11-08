import * as Sentry from "@sentry/nextjs";
import { timingSafeEqual } from "node:crypto";
import { runDeletionWarningsJob } from "@/lib/deletionWarnings";

export const dynamic = "force-dynamic";

/** Plain `!==` on a bearer token leaks its length (and, in principle, a
 *  byte-by-byte timing signal) to whoever can measure response latency —
 *  timingSafeEqual needs equal-length buffers or it throws, so a length
 *  mismatch is treated as "not equal" up front rather than letting that
 *  throw become its own timing tell. */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Runs once a day via the "crons" entry in vercel.json. Vercel sends every
 * cron request with this exact header — checked here rather than trusting
 * the path alone, since the route is otherwise a public URL.
 *
 * ?dryRun=true runs every read and decision with no writes at all (no
 * email sent, no lapsed_at set/cleared, no warning claimed, no account
 * deleted) — for a manual check against real data with no side effects.
 *
 * While PAYWALL_ENABLED is off, the response is just
 * {"skippedReason":"paywall-disabled", ...all zeros} — runDeletionWarningsJob
 * returns that before it ever touches the database, so this never scans
 * subscriptions on PAYWALL_ENABLED's account alone.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!constantTimeEquals(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
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
