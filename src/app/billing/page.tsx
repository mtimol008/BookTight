import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentSubscription } from "@/lib/subscriptions";
import { createCheckoutSession, createPortalSession } from "./actions";

const ALREADY_SUBSCRIBED_STATUSES = ["trialing", "active", "past_due"];

const STATUS_LABELS: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Payment failed — retrying",
  canceled: "Cancelled",
  unpaid: "Unpaid",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  paused: "Paused",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; checkout?: string }>;
}) {
  const { error, checkout } = await searchParams;
  const subscription = await getCurrentSubscription();
  if (!subscription) {
    redirect("/login");
  }

  const hasStripeSubscription = ALREADY_SUBSCRIBED_STATUSES.includes(subscription.status ?? "");
  // Checkout succeeded at Stripe, but the webhook that actually records it
  // here may not have landed yet — a few seconds of normal lag, not a
  // failure, so this is shown instead of "no subscription".
  const stillProcessing = checkout === "success" && !hasStripeSubscription;

  const trialActive =
    !!subscription.trial_ends_at &&
    !subscription.stripe_subscription_id &&
    new Date(subscription.trial_ends_at) > new Date();

  return (
    <AppShell>
      <div className="screen-head">
        <div className="wordmark">Booktight</div>
      </div>

      <div className="section-label" style={{ marginTop: 20, marginBottom: 8 }}>
        Billing
      </div>
      <div className="card">
        {error && <p className="error-text">{error}</p>}

        {stillProcessing ? (
          <p>
            Processing your subscription — this usually takes a few seconds. Refresh if this
            doesn&apos;t update shortly.
          </p>
        ) : hasStripeSubscription ? (
          <>
            <p>
              Plan: <strong>{subscription.plan === "yearly" ? "Yearly (£109/year)" : "Monthly (£9.99/month)"}</strong>
            </p>
            <p className="note" style={{ marginTop: 4 }}>
              {STATUS_LABELS[subscription.status ?? ""] ?? subscription.status}
            </p>
            {subscription.current_period_end && (
              <p className="note">
                {subscription.cancel_at_period_end ? "Cancels" : "Renews"} on{" "}
                {formatDate(subscription.current_period_end)}
              </p>
            )}
            <form action={createPortalSession} style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn--primary btn--block">
                Manage billing
              </button>
            </form>
          </>
        ) : subscription.comped_until && new Date(subscription.comped_until) > new Date() ? (
          // Comped: no subscribe nag at all — this account doesn't need to
          // pay, full stop, not just "doesn't need to yet".
          <p>
            Free until <strong>{formatDate(subscription.comped_until)}</strong>.
          </p>
        ) : (
          <>
            {trialActive ? (
              <p>
                Free trial — ends <strong>{formatDate(subscription.trial_ends_at!)}</strong>.
              </p>
            ) : (
              <p>No active subscription.</p>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <form action={createCheckoutSession} style={{ flex: 1 }}>
                <input type="hidden" name="plan" value="monthly" />
                <button type="submit" className="btn btn--primary btn--block">
                  Monthly — £9.99/mo
                </button>
              </form>
              <form action={createCheckoutSession} style={{ flex: 1 }}>
                <input type="hidden" name="plan" value="yearly" />
                <button type="submit" className="btn btn--outline btn--block">
                  Yearly — £109/yr
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      <p className="note" style={{ marginTop: 16 }}>
        Questions about billing? <Link href="/contact">Contact us</Link>.
      </p>
    </AppShell>
  );
}
