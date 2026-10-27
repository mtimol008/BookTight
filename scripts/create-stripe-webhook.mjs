// Run once, after the webhook route is actually deployed and reachable:
//   node scripts/create-stripe-webhook.mjs
//
// Creates a webhook endpoint (test mode — same account STRIPE_SECRET_KEY
// belongs to) pointed at the production URL, subscribed to exactly the
// event types src/app/api/stripe/webhook/route.ts handles, and appends the
// resulting signing secret to .env.local.
//
// Stripe only ever returns an endpoint's secret at the moment it's
// created — re-fetching an existing endpoint later never includes it
// again. So this is NOT safe to blindly re-run the way
// create-stripe-prices.mjs is: if STRIPE_WEBHOOK_SECRET is already in
// .env.local, it stops immediately rather than creating a second,
// redundant endpoint.
import Stripe from "stripe";
import nextEnv from "@next/env";
import { readFileSync, appendFileSync } from "fs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

const ENV_PATH = "C:\\Users\\ussit\\Desktop\\booktight-app\\.env.local";
const WEBHOOK_URL = "https://booktight.co.uk/api/stripe/webhook";

const ENABLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.trial_will_end",
];

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local.");
  process.exit(1);
}
if (!secretKey.startsWith("sk_test_")) {
  console.error(
    `STRIPE_SECRET_KEY doesn't look like a test-mode key (expected sk_test_..., got a key starting "${secretKey.slice(0, 8)}..."). Refusing to create a live webhook endpoint with it.`
  );
  process.exit(1);
}

const existingEnv = readFileSync(ENV_PATH, "utf8");
if (/^STRIPE_WEBHOOK_SECRET=.+$/m.test(existingEnv)) {
  console.log(
    "STRIPE_WEBHOOK_SECRET is already in .env.local — not creating another endpoint (Stripe only shows a secret once, at creation, so a second run can't safely reuse an existing one)."
  );
  process.exit(0);
}

const stripe = new Stripe(secretKey);

const endpoint = await stripe.webhookEndpoints.create({
  url: WEBHOOK_URL,
  enabled_events: ENABLED_EVENTS,
  description: "BookTight (test mode) — created by scripts/create-stripe-webhook.mjs",
});

if (!endpoint.secret) {
  console.error("Stripe created the endpoint but didn't return a secret — unexpected, check the Dashboard.");
  process.exit(1);
}

console.log("Created webhook endpoint:", endpoint.id, "->", WEBHOOK_URL);
console.log("Events:", ENABLED_EVENTS.join(", "));

appendFileSync(ENV_PATH, `\nSTRIPE_WEBHOOK_SECRET=${endpoint.secret}\n`);
console.log("\nAppended STRIPE_WEBHOOK_SECRET to .env.local.");
