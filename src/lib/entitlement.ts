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

/**
 * Like lapsedSince(), but floored at PAYWALL_LIVE_FROM (the date the
 * paywall actually started enforcing entitlement) — used by the 90-day
 * deletion cron and the billing banner so neither ever starts an account's
 * deletion clock earlier than paywall launch itself. Without this floor, an
 * existing beta account whose nominal trial_ends_at is months in the past
 * would look like it lapsed back then too, and could be due for deletion
 * within hours of the paywall switching on.
 *
 * Throws if the paywall is enabled but this floor was never set — that
 * combination must never run quietly, since every lapse date it computes
 * would be wrong.
 */
export function effectiveLapsedAt(sub: SubscriptionRecord | null): Date | null {
  const raw = lapsedSince(sub);
  if (!raw) {
    return null;
  }
  if (!isPaywallEnabled()) {
    return raw;
  }
  const floorRaw = process.env.PAYWALL_LIVE_FROM;
  if (!floorRaw) {
    throw new Error(
      "PAYWALL_LIVE_FROM must be set once PAYWALL_ENABLED is true — it's the floor under every " +
        "account's deletion clock, so a lapse date can never predate paywall launch itself."
    );
  }
  const floor = new Date(floorRaw);
  return floor > raw ? floor : raw;
}
