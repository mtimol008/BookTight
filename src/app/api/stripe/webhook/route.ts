import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripeClient, priceIdToPlan } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * User identity never comes from a DB lookup by stripe_customer_id or
 * stripe_subscription_id here — every event type below carries its own
 * user_id directly from Stripe (client_reference_id on the Checkout
 * Session, subscription.metadata.user_id, or
 * invoice.parent.subscription_details.metadata — Stripe's own immutable
 * snapshot of that same subscription metadata, taken at invoice
 * finalization), both set at Checkout creation time (see
 * createCheckoutSession). That's what makes event order not matter: a
 * customer.subscription.created delivered before checkout.session.completed
 * still knows exactly which user it's for.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return new Response("Missing signature or server not configured", { status: 400 });
  }

  // Raw bytes, not .json() — Stripe's signature covers the exact body as
  // sent, and App Router route handlers don't auto-parse the body, so this
  // is already the raw payload with no extra config needed.
  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: already } = await admin
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (already) {
    return new Response("OK", { status: 200 });
  }

  try {
    await handleEvent(admin, event);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { stripeEventType: event.type, stripeEventId: event.id },
    });
    // Non-2xx makes Stripe retry — the event is deliberately NOT recorded
    // below, so the retry re-processes it in full rather than being
    // silently skipped as already-handled.
    return new Response("Webhook handler failed", { status: 500 });
  }

  const { error: recordError } = await admin
    .from("stripe_webhook_events")
    .insert({ event_id: event.id });
  if (recordError) {
    // Processing itself already succeeded — a retried delivery would just
    // safely redo the same update (every write below is a plain field
    // sync, not an increment), so this is worth knowing about but not
    // worth failing the whole webhook over.
    Sentry.captureException(new Error(recordError.message), {
      tags: { stripeEventId: event.id },
    });
  }

  return new Response("OK", { status: 200 });
}

async function handleEvent(admin: AdminClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      if (!userId) {
        throw new Error(
          `checkout.session.completed with no client_reference_id (session ${session.id})`
        );
      }

      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

      // Just links the Stripe objects to this user — status/plan/period
      // come from customer.subscription.created, which fires for every
      // new subscription regardless of which of the two events lands
      // first.
      const { error } = await admin
        .from("subscriptions")
        .update({
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id: subscriptionId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.user_id;
      if (!userId) {
        throw new Error(`${event.type} with no metadata.user_id (subscription ${subscription.id})`);
      }

      const item = subscription.items.data[0];
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

      const { error } = await admin
        .from("subscriptions")
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          plan: priceIdToPlan(item?.price.id),
          current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      break;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const userId = invoice.parent?.subscription_details?.metadata?.user_id;
      if (!userId) {
        // Not every invoice is subscription-related — nothing to do.
        break;
      }

      // Only invoice.payment_failed needs to act here: it flips status to
      // past_due immediately (what the payment-failed banner reads)
      // rather than waiting on a subscription.updated event that may lag
      // behind. invoice.paid's own effect (clearing past_due back to
      // active) already arrives via subscription.updated, which Stripe
      // always sends alongside a successful payment.
      if (event.type === "invoice.payment_failed") {
        const { error } = await admin
          .from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        if (error) throw new Error(error.message);
      }
      break;
    }

    case "customer.subscription.trial_will_end":
      // No Stripe-side trial is ever created in this app's no-card design
      // (see subscriptions.trial_ends_at's own comment) — handled here
      // defensively in case that ever changes; a genuine no-op today.
      break;

    default:
      // Unhandled event types fall through to a 200 below so Stripe stops
      // retrying something this app was never going to act on.
      break;
  }
}
