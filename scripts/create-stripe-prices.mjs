// Run once: npx tsx --conditions=node scripts/create-stripe-prices.mjs
//   or simply: node scripts/create-stripe-prices.mjs
//
// Creates the BookTight Product and its two Prices (monthly £9.99, yearly
// £109, both GBP) in whichever Stripe account STRIPE_SECRET_KEY in
// .env.local belongs to — test mode, since that's what a sk_test_... key
// is scoped to. Safe to re-run: if STRIPE_PRICE_ID_MONTHLY/YEARLY are
// already in .env.local, it does nothing and just prints them back.
//
// Appends the two resulting price IDs to .env.local itself, so this is the
// only place they need to be created by hand — nothing else to do in the
// Stripe dashboard for this part.
import Stripe from "stripe";
import nextEnv from "@next/env";
import { readFileSync, appendFileSync } from "fs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), false);

const ENV_PATH = "C:\\Users\\ussit\\Desktop\\booktight-app\\.env.local";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local.");
  process.exit(1);
}
if (!secretKey.startsWith("sk_test_")) {
  console.error(
    `STRIPE_SECRET_KEY doesn't look like a test-mode key (expected sk_test_..., got a key starting "${secretKey.slice(0, 8)}..."). Refusing to create live products with it.`
  );
  process.exit(1);
}

const existingEnv = readFileSync(ENV_PATH, "utf8");
const alreadyHasMonthly = /^STRIPE_PRICE_ID_MONTHLY=.+$/m.test(existingEnv);
const alreadyHasYearly = /^STRIPE_PRICE_ID_YEARLY=.+$/m.test(existingEnv);

if (alreadyHasMonthly && alreadyHasYearly) {
  console.log("STRIPE_PRICE_ID_MONTHLY and STRIPE_PRICE_ID_YEARLY are already in .env.local — nothing to do.");
  for (const line of existingEnv.split("\n")) {
    if (line.startsWith("STRIPE_PRICE_ID_")) console.log(line);
  }
  process.exit(0);
}

const stripe = new Stripe(secretKey);

// Reuse an existing "BookTight" product if one's already there (e.g. a
// previous run created the product but failed before writing the prices)
// rather than creating a duplicate every time this is re-run.
const products = await stripe.products.search({ query: `name:"BookTight" AND active:"true"` });
let product = products.data[0];
if (!product) {
  product = await stripe.products.create({
    name: "BookTight",
    description: "Job scheduling that minimizes driving distance.",
  });
  console.log("Created product:", product.id);
} else {
  console.log("Reusing existing product:", product.id);
}

const monthlyPrice = await stripe.prices.create({
  product: product.id,
  currency: "gbp",
  unit_amount: 999, // £9.99
  recurring: { interval: "month" },
  nickname: "Monthly",
});
console.log("Created monthly price:", monthlyPrice.id, "£9.99/month");

const yearlyPrice = await stripe.prices.create({
  product: product.id,
  currency: "gbp",
  unit_amount: 10900, // £109.00
  recurring: { interval: "year" },
  nickname: "Yearly",
});
console.log("Created yearly price:", yearlyPrice.id, "£109.00/year");

appendFileSync(
  ENV_PATH,
  `\nSTRIPE_PRICE_ID_MONTHLY=${monthlyPrice.id}\nSTRIPE_PRICE_ID_YEARLY=${yearlyPrice.id}\n`
);
console.log("\nAppended STRIPE_PRICE_ID_MONTHLY and STRIPE_PRICE_ID_YEARLY to .env.local.");
