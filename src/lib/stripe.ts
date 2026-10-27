import Stripe from "stripe";

let client: Stripe | null = null;

/** Lazily constructed, cached across calls within the same server process —
 *  same reasoning as the Supabase admin client: cheap to reuse, no reason
 *  to recreate it on every call within one request. */
export function getStripeClient(): Stripe {
  if (client) {
    return client;
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY. Add it to .env.local — find it in the Stripe dashboard " +
        "under Developers > API keys."
    );
  }
  client = new Stripe(secretKey);
  return client;
}

export type SubscriptionPlan = "monthly" | "yearly";

/** Maps a Stripe Price id back to our own 'monthly' | 'yearly' label, via
 *  the same two env vars scripts/create-stripe-prices.mjs wrote — not
 *  Stripe's price.recurring.interval, so a dashboard-created price with an
 *  unexpected interval can never silently get labeled as one of ours. */
export function priceIdToPlan(priceId: string | null | undefined): SubscriptionPlan | null {
  if (!priceId) {
    return null;
  }
  if (priceId === process.env.STRIPE_PRICE_ID_MONTHLY) {
    return "monthly";
  }
  if (priceId === process.env.STRIPE_PRICE_ID_YEARLY) {
    return "yearly";
  }
  return null;
}
