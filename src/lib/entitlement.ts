import type { SubscriptionRecord } from "./subscriptions";
import { isPaywallEnabled } from "./paywallConfig";

/** Thrown message for every gated action — one shared string so it reads
 *  the same everywhere a lapsed account hits it. */
export const READ_ONLY_MESSAGE =
  "Your subscription has lapsed. You can still export your data from Account, or resubscribe from Billing.";

/**
 * Whether this account can create or change jobs right now. The one
 * server-side gate for that — called from every job action that saves,
 * updates, completes, cancels or reorders a job (src/app/actions.ts).
 * Deliberately NOT called from delete, export, account deletion or
 * /billing — a lapsed account must still be able to tidy up, get its data
 * out, close the account, or resubscribe.
 *
 * Always true while the paywall itself is off (PAYWALL_ENABLED unset) —
 * this function (and the subscriptions table behind it) can ship and run
 * quietly ahead of actually enforcing anything.
 */
export function hasActiveEntitlement(sub: SubscriptionRecord | null): boolean {
  if (!isPaywallEnabled()) {
    return true;
  }

  if (!sub) {
    return false;
  }

  if (sub.comped_until && new Date(sub.comped_until) > new Date()) {
    return true;
  }

  // Still inside the no-card trial window, and never actually subscribed —
  // once a real Stripe subscription exists its own status below is the
  // source of truth instead, even if trial_ends_at technically hasn't
  // passed yet (e.g. they subscribed partway through the trial).
  if (
    sub.trial_ends_at &&
    !sub.stripe_subscription_id &&
    new Date(sub.trial_ends_at) > new Date()
  ) {
    return true;
  }

  // past_due stays entitled — Stripe is still retrying the card (see the
  // invoice.payment_failed webhook handler for the banner this drives).
  // Only once Stripe itself lands on canceled/unpaid/incomplete_expired
  // does this flip to read-only.
  return sub.status === "trialing" || sub.status === "active" || sub.status === "past_due";
}

/**
 * The moment this account actually lost entitlement, or null while it's
 * still entitled — used for the calendar feed's own 30-day grace period
 * (see the feed route), which needs an actual date to count from, not just
 * today's yes/no. Mirrors hasActiveEntitlement's own priority order
 * (comped, then no-card trial, then Stripe status) so the two never
 * disagree about why an account is or isn't entitled.
 */
export function lapsedSince(sub: SubscriptionRecord | null): Date | null {
  if (hasActiveEntitlement(sub)) {
    return null;
  }
  if (!sub) {
    return new Date(0);
  }
  if (sub.comped_until) {
    return new Date(sub.comped_until);
  }
  if (sub.trial_ends_at && !sub.stripe_subscription_id) {
    return new Date(sub.trial_ends_at);
  }
  if (sub.current_period_end) {
    return new Date(sub.current_period_end);
  }
  // No subscription ever started and no trial was ever recorded —
  // shouldn't happen for any real account once the switch-on backfill has
  // run, but there's nothing to measure a grace period from, so treat it
  // as lapsed with none left.
  return new Date(0);
}
