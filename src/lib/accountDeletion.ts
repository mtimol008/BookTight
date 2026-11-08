import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "./supabase/admin";
import { getStripeClient } from "./stripe";
import { getSubscriptionByUserId } from "./subscriptions";

/** Thrown specifically for a failed Stripe cancellation — callers that want
 *  to show a distinct "try again" message (rather than a generic failure)
 *  catch this type. */
export class StripeCancelError extends Error {}

export type DeletionReason = "user_requested" | "auto_90_day";

/**
 * The actual account-destruction sequence — shared by the user-initiated
 * delete action (src/app/account/delete/actions.ts) and the 90-day
 * deletion cron (src/lib/deletionWarnings.ts), so there is exactly one
 * tested path that ever deletes an account.
 *
 * Order matters: any real Stripe subscription is cancelled first (throwing
 * StripeCancelError aborts everything below it, rather than deleting the
 * Supabase account out from under a subscription Stripe would keep
 * billing); then the deletion is logged permanently — account_deletion_log
 * has no foreign key to auth.users, specifically so that row survives the
 * very deletion it's recording; then the Supabase auth user is deleted,
 * which cascades profiles/jobs/subscriptions/deletion_warning_log; then
 * the Stripe customer is cleaned up best-effort, since the Supabase side is
 * already done and is what the caller actually asked for.
 */
export async function deleteAccountCore(userId: string, reason: DeletionReason): Promise<void> {
  const admin = createAdminClient();
  const subscription = await getSubscriptionByUserId(userId);

  if (subscription?.stripe_subscription_id) {
    try {
      await getStripeClient().subscriptions.cancel(subscription.stripe_subscription_id);
    } catch (err) {
      throw new StripeCancelError(err instanceof Error ? err.message : String(err));
    }
  }

  const { count: jobsCount } = await admin
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  // No email here — this is only ever a record that a deletion happened,
  // not a place to keep hold of personal data past the deletion it's
  // logging.
  const { error: logError } = await admin.from("account_deletion_log").insert({
    user_id: userId,
    reason,
    jobs_count: jobsCount ?? 0,
  });
  if (logError) {
    throw new Error(`Failed to write account_deletion_log: ${logError.message}`);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message);
  }

  // Best-effort from here — the Supabase account is already gone, which is
  // what was actually asked for (by the user, or by the 90-day policy), so
  // a Stripe customer cleanup failure at this point is worth knowing about
  // but not worth undoing anything over.
  if (subscription?.stripe_customer_id) {
    try {
      await getStripeClient().customers.del(subscription.stripe_customer_id);
    } catch (err) {
      Sentry.captureException(err, { tags: { stage: "delete-account-delete-customer", reason } });
    }
  }
}
