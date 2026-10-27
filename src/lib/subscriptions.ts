import { createAdminClient } from "./supabase/admin";
import { createClient, withAuthRetry } from "./supabase/server";

/** Mirrors Stripe's own subscription.status values verbatim — see the
 *  subscriptions_status_check constraint in the migration that created
 *  this table. */
export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type SubscriptionPlan = "monthly" | "yearly";

export interface SubscriptionRecord {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  /** null = never subscribed. */
  status: SubscriptionStatus | null;
  plan: SubscriptionPlan | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** This app's own no-card trial clock — independent of Stripe. Null for
   *  every account that existed before the paywall switch-on day, until
   *  that day's one-time backfill sets it. */
  trial_ends_at: string | null;
  /** Manual override (set by hand in the SQL Editor) — null = not comped. */
  comped_until: string | null;
  updated_at: string;
}

/** Current user's own subscription row, or null if signed out or (should
 *  never happen post-migration) somehow missing one — every account gets
 *  a row from handle_new_user() at signup. Read-only from here: writes
 *  only ever happen via the service-role client (the Stripe webhook,
 *  billing actions, account deletion) — see the migration's RLS policy. */
export async function getCurrentSubscription(): Promise<SubscriptionRecord | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data, error } = await withAuthRetry(() =>
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle()
  );

  if (error) {
    throw new Error(`Failed to fetch subscription: ${error.message}`);
  }

  return data;
}

/**
 * Admin-client lookup by user id — for routes with no Supabase session to
 * read an RLS-scoped row through, e.g. the public .ics calendar feed
 * (token-authenticated, the same reasoning getProfileByFeedToken already
 * documents for why it uses the admin client too).
 */
export async function getSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch subscription: ${error.message}`);
  }

  return data;
}
