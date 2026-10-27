import { getCurrentProfileWithUser } from "@/lib/profiles";
import { getAllJobsForCurrentUser, type JobRecord } from "@/lib/jobs";
import { toCsv } from "@/lib/csv";
import { checkIpRateLimit } from "@/lib/rateLimit";

// Per-user, not per-IP — every caller here is already authenticated, so the
// account id is the meaningful key (an IP-based limit would unfairly
// penalize other users behind the same NAT/office network). Generous since
// this is a real, infrequent user action, not a public endpoint under
// abuse: someone reasonably clicking all three download links a few times
// while checking their export shouldn't ever see a 429.
const EXPORT_RATE_LIMIT_WINDOW_MINUTES = 5;
const EXPORT_RATE_LIMIT_MAX_REQUESTS = 20;

const JOB_CSV_COLUMNS: (keyof JobRecord)[] = [
  "id",
  "address",
  "latitude",
  "longitude",
  "date",
  "time_slot_type",
  "specific_time",
  "customer_name",
  "description",
  "duration_minutes",
  "manual_position",
  "status",
  "urgency",
  "created_at",
];

function noStore(body: BodyInit, contentType: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const result = await getCurrentProfileWithUser();
  if (!result) {
    return new Response("Not logged in", { status: 401 });
  }
  const { profile, user } = result;

  // Keyed by user id, not IP — see the rate-limit constants' comment above.
  const allowed = await checkIpRateLimit(
    user.id,
    "account_export",
    EXPORT_RATE_LIMIT_WINDOW_MINUTES,
    EXPORT_RATE_LIMIT_MAX_REQUESTS
  );
  if (!allowed) {
    return new Response("Too many export requests. Please try again in a few minutes.", {
      status: 429,
    });
  }

  const type = new URL(request.url).searchParams.get("type");

  // calendar_feed_token is deliberately left out of every export shape
  // below — it's a live credential (anyone holding it can read the
  // account's jobs via the public .ics endpoint), not account data to hand
  // back as a downloadable file. engagement_state is internal UI
  // bookkeeping (which hints have been dismissed), left in since it's
  // genuinely part of "your data" and harmless to see.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- discarded on purpose
  const { calendar_feed_token, ...profileWithoutFeedToken } = profile;

  if (type === "json") {
    const jobs = await getAllJobsForCurrentUser();
    const payload = {
      exportedAt: new Date().toISOString(),
      email: user.email ?? null,
      profile: profileWithoutFeedToken,
      jobs,
    };
    return noStore(
      JSON.stringify(payload, null, 2),
      "application/json",
      "booktight-export.json"
    );
  }

  if (type === "jobs-csv") {
    const jobs = await getAllJobsForCurrentUser();
    const csv = toCsv(
      JOB_CSV_COLUMNS,
      jobs.map((job) => JOB_CSV_COLUMNS.map((column) => job[column]))
    );
    return noStore(csv, "text/csv", "booktight-jobs.csv");
  }

  if (type === "profile-csv") {
    const { engagement_state, working_hours, ...rest } = profileWithoutFeedToken;
    const row = {
      email: user.email ?? null,
      ...rest,
      working_hours: JSON.stringify(working_hours),
      engagement_state: JSON.stringify(engagement_state),
    };
    const headers = Object.keys(row);
    const csv = toCsv(headers, [headers.map((key) => row[key as keyof typeof row])]);
    return noStore(csv, "text/csv", "booktight-profile.csv");
  }

  return new Response('Unknown or missing "type" — expected json, jobs-csv, or profile-csv.', {
    status: 400,
  });
}
