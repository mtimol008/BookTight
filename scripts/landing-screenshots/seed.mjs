// Creates the throwaway demo account used for the landing-page screenshots
// and fills its week with invented jobs. Run:
//   npm run screenshots:seed                                             # staging
//   npm run screenshots:seed -- --target=production --i-really-mean-production
// Then `npm run screenshots:capture`, then `npm run screenshots:cleanup`.
// Only ever touches the one account it creates (every write below is
// scoped to that user_id) — lower blast radius than a full-table scan,
// but still real writes against a real project, so it gets the same
// staging-by-default guard as every other throwaway-account script.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { DEMO_JOBS, DEMO_NEW_JOB, DEMO_PROFILE, DEMO_TIMEZONE, HINT_IDS } from "./demo-data.mjs";
import { STATE_FILE, TERMS_VERSION, mondayOfThisWeek, addDays } from "./shared.mjs";
import { resolveTarget } from "../lib/supabase-target.mjs";

if (existsSync(STATE_FILE)) {
  console.error("A demo account already exists. Run `npm run screenshots:cleanup` first.");
  process.exit(1);
}

let url, secret;
try {
  ({ url, secretKey: secret } = resolveTarget());
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const email = `landing-demo-${randomBytes(4).toString("hex")}@example.com`;
const monday = mondayOfThisWeek();

// 1. The account. The new-user trigger creates its profile (home address,
//    names, timezone, terms) and a 14-day trial from this metadata.
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: {
    full_name: DEMO_PROFILE.full_name,
    business_name: DEMO_PROFILE.business_name,
    home_address: DEMO_PROFILE.home_address,
    home_latitude: DEMO_PROFILE.home_latitude,
    home_longitude: DEMO_PROFILE.home_longitude,
    timezone: DEMO_TIMEZONE,
    terms_version: TERMS_VERSION,
  },
});
if (createError) throw createError;
const userId = created.user.id;

// Saved straight away so cleanup can find the account even if a later step fails.
writeFileSync(STATE_FILE, JSON.stringify({ userId, email, monday, newJobAddress: DEMO_NEW_JOB.address }, null, 2));

// 2. Settings, and every first-run tour, hint and celebration marked as seen.
const { error: profileError } = await admin
  .from("profiles")
  .update({
    working_hours: DEMO_PROFILE.working_hours,
    max_travel_range_km: DEMO_PROFILE.max_travel_range_km,
    max_jobs_per_day: DEMO_PROFILE.max_jobs_per_day,
    buffer_minutes: DEMO_PROFILE.buffer_minutes,
    distance_unit: DEMO_PROFILE.distance_unit,
    onboarding_completed_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    engagement_state: { entryChoiceMade: true, tourShown: true, ahaMomentShown: true, dismissedHints: HINT_IDS },
  })
  .eq("id", userId);
if (profileError) throw profileError;

// 3. The week's jobs.
const rows = DEMO_JOBS.map((job) => ({
  user_id: userId,
  customer_name: job.customer_name,
  description: job.description,
  address: job.address,
  latitude: job.latitude,
  longitude: job.longitude,
  date: addDays(monday, job.dayOffset),
  time_slot_type: job.time_slot_type,
  specific_time: job.specific_time ?? null,
  duration_minutes: job.duration_minutes,
  status: "scheduled",
  urgency: "normal",
}));
const { error: jobsError } = await admin.from("jobs").insert(rows);
if (jobsError) throw jobsError;

// 4. The new job's address, pre-geocoded.
const { error: cacheError } = await admin.rpc("set_cached_geocode", {
  p_address_key: DEMO_NEW_JOB.address.trim().toLowerCase(),
  p_latitude: DEMO_NEW_JOB.latitude,
  p_longitude: DEMO_NEW_JOB.longitude,
  p_formatted_address: DEMO_NEW_JOB.address,
});
if (cacheError) throw cacheError;

console.log(`Demo account ready: ${rows.length} invented jobs in the week of ${monday}.`);
console.log("Next: npm run screenshots:capture");
