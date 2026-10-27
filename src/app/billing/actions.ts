"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSubscription } from "@/lib/subscriptions";
import { getStripeClient } from "@/lib/stripe";

// A real Stripe subscription already exists in any of these states —
// past_due included, since Stripe is still retrying that card, not
// something a second Checkout should duplicate.
const ALREADY_SUBSCRIBED_STATUSES = ["trialing", "active", "past_due"];

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function redirectWithError(message: string): never {
  redirect(`/billing?error=${encodeURIComponent(message)}`);
}

export async function createCheckoutSession(formData: FormData): Promise<void> {
  const plan = formData.get("plan")?.toString();
  if (plan !== "monthly" && plan !== "yearly") {
    redirectWithError("Invalid plan.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const subscription = await getCurrentSubscription();
  if (subscription && ALREADY_SUBSCRIBED_STATUSES.includes(subscription.status ?? "")) {
    redirectWithError("You already have a subscription — manage it below instead.");
  }

  const priceId =
    plan === "monthly" ? process.env.STRIPE_PRICE_ID_MONTHLY : process.env.STRIPE_PRICE_ID_YEARLY;
  if (!priceId) {
    redirectWithError("Pricing isn't configured yet.");
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // Both set here, read back by the webhook two different ways
    // depending on which event it's handling — see that route's own
    // comment for why that's what makes event order not matter.
    client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id } },
    ...(subscription?.stripe_customer_id
      ? { customer: subscription.stripe_customer_id }
      : { customer_email: user.email }),
    success_url: `${appUrl()}/billing?checkout=success`,
    cancel_url: `${appUrl()}/billing?checkout=cancelled`,
  });

  if (!session.url) {
    redirectWithError("Stripe did not return a Checkout URL.");
  }

  redirect(session.url);
}

export async function createPortalSession(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const subscription = await getCurrentSubscription();
  if (!subscription?.stripe_customer_id) {
    redirectWithError("No billing account yet — subscribe first.");
  }

  const stripe = getStripeClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${appUrl()}/billing`,
  });

  redirect(portalSession.url);
}
