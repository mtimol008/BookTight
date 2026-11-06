// Prints how many distinct accounts have ever reached each analytics
// milestone, plus an "activated" count (accounts with 3+ jobs booked
// within 7 days of signing up — computed live from jobs/profiles, not
// from a logged event, since "activated" is a derived cohort metric, not
// a point-in-time thing to record once per user).
//
// Run: node scripts/analytics-counts.mjs
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EVENTS = ["signup", "onboarding_complete", "first_job", "third_job", "day2_return", "trial_to_paid"];

console.log("Analytics event counts (distinct accounts that ever reached each milestone):\n");

for (const event of EVENTS) {
  const { count, error } = await admin
    .from("analytics_events")
    .select("user_id", { count: "exact", head: true })
    .eq("event", event);
  if (error) throw new Error(`${event}: ${error.message}`);
  console.log(`  ${event.padEnd(20)} ${count ?? 0}`);
}

// --- Activated: 3+ jobs within 7 days of signup ---
// Paged rather than a single huge select — fine at this app's current
// scale, and avoids a silent row-limit truncation later without needing
// to revisit this script.
async function fetchAllPages(table, columns, pageSize = 1000) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

const profiles = await fetchAllPages("profiles", "id, created_at");
const jobs = await fetchAllPages("jobs", "user_id, created_at");

const jobsByUser = new Map();
for (const job of jobs) {
  const list = jobsByUser.get(job.user_id) ?? [];
  list.push(new Date(job.created_at).getTime());
  jobsByUser.set(job.user_id, list);
}

let activated = 0;
for (const profile of profiles) {
  const signupMs = new Date(profile.created_at).getTime();
  const cutoffMs = signupMs + 7 * 24 * 60 * 60 * 1000;
  const withinWeek = (jobsByUser.get(profile.id) ?? []).filter((ms) => ms >= signupMs && ms <= cutoffMs);
  if (withinWeek.length >= 3) {
    activated++;
  }
}

console.log(`\n  activated (3+ jobs in first 7 days) ${activated} of ${profiles.length} accounts`);
