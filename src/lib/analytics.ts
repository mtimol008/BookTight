import { createAdminClient } from "./supabase/admin";

/** Matches analytics_events_event_check in the migration — keep both in sync. */
export type AnalyticsEvent =
  | "signup"
  | "onboarding_complete"
  | "first_job"
  | "third_job"
  | "day2_return"
  | "trial_to_paid";

/**
 * Records that this account reached a milestone — once, ever, no matter
 * how many times this is called for the same (user, event) pair, thanks
 * to the migration's own unique constraint. Callers never need to check
 * "has this already happened" themselves first.
 *
 * Deliberately swallows its own errors (logged, not thrown) — analytics
 * failing must never break the actual feature it's attached to (e.g. a
 * flaky write here shouldn't fail a job save).
 */
export async function recordEvent(userId: string, event: AnalyticsEvent): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("analytics_events")
      .upsert({ user_id: userId, event }, { onConflict: "user_id,event", ignoreDuplicates: true });
    if (error) {
      console.error(`analytics: failed to record "${event}" for ${userId}:`, error.message);
    }
  } catch (err) {
    console.error(`analytics: failed to record "${event}" for ${userId}:`, err);
  }
}
