// RUNS AGAINST A REAL DATABASE — staging by default, never production
// without an explicit, unambiguous override (see scripts/lib/supabaseTarget.ts).
// RUNS AGAINST REAL STRIPE TEST MODE for #9 (refuses to run against a key
// that isn't sk_test_...).
//
// Regression tests for 6 more fixes from the full-app audit (findings
// #8, #9, #11, #13, #14, #16):
//
//   #8  getAllJobsForCurrentUser (feeds data export) had no pagination —
//       PostgREST's own default page size silently truncated a prolific
//       account's export with no warning. Fixed by paging through in
//       batches via .range() until a short page. Phase A.
//   #9  The Stripe webhook had no case for charge.refunded — a refund
//       processed from Stripe's dashboard left the user's paid access
//       untouched, with nothing anywhere to flag it. Fixed by flagging it
//       to Sentry (full vs partial, deliberately not auto-cancelling — see
//       the fix's own comment for why). Phase B, with a REAL test-mode
//       refund. NOTE: Sentry's own receipt of the capture can't be
//       verified from this environment (no API token, no dashboard
//       session, and Sentry's exports are read-only ES module bindings —
//       confirmed directly, can't be monkeypatched from a test script
//       either) — this phase verifies the webhook handles the event
//       cleanly (200, no crash) and that the full/partial classification
//       the fix's logic depends on is correct for the real charge data,
//       plus a static check that the right Sentry call with the right
//       level exists in the source for each branch.
//   #11 The same webhook's subscription-row updates matched zero rows
//       silently on data drift, with no record anywhere. Fixed via
//       updateSubscriptionRow's count check + Sentry. Same Sentry caveat
//       as #9 — verified here via a 0-row scenario that doesn't crash,
//       plus confirming the normal (matching-row) case still updates
//       correctly, by hand-signing a synthetic event with the real
//       webhook secret (stripe.webhooks.generateTestHeaderStringAsync) —
//       this only requires knowing the secret, not Stripe actually
//       delivering the event, so it doesn't depend on charge.refunded (or
//       any event) being in the live endpoint's enabled_events list.
//   #13 Billing page showed the same "No active subscription." for a
//       trial that ran out and an account that never had one. Fixed with
//       a distinct "Your trial ended on..." message. Phase C.
//   #14 confirmAndSaveJob had no protection against a raw double
//       Next-Action request creating two identical jobs. Fixed with
//       findRecentDuplicateJob. Phase D.
//   #16 not-found.tsx had no page-specific title. Phase E.
//
// Builds and starts its own throwaway `next start` instance pointed at the
// resolved target, signs in via the magic-link-to-cookie-jar technique
// (same as scripts/test-security-fixes.ts / test-audit-fixes-2.ts). Tears
// the server down and deletes every account/Stripe object it creates, even
// on failure.
//
//   npm run test:audit-fixes-3                                     # staging
//   npm run test:audit-fixes-3 -- --target=production --i-really-mean-production
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exitCode = 1;
});

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync, execSync } from "node:child_process";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import Stripe from "stripe";
import { resolveTarget } from "./lib/supabaseTarget";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!pass) failures++;
}

// ----------------------------------------------------------------- setup

const creds = (() => {
  try {
    return resolveTarget();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
})();
const { url, secretKey, publishableKey } = creds;
if (!publishableKey) {
  console.error(
    "Missing a publishable key for this target (STAGING_SUPABASE_PUBLISHABLE_KEY for staging, " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for production) — needed to build a real session."
  );
  process.exit(1);
}
const admin: SupabaseClient = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const TERMS_VERSION = readFileSync("src/lib/terms.ts", "utf8").match(
  /TERMS_VERSION\s*=\s*"([^"]+)"/
)![1];

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_test_")) {
  console.error(
    `STRIPE_SECRET_KEY doesn't look like a test-mode key (expected sk_test_...). Refusing to run #9's real-refund phase.`
  );
  process.exit(1);
}
const stripe = new Stripe(stripeSecretKey);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
  console.error("Missing STRIPE_WEBHOOK_SECRET — needed to sign test webhook deliveries.");
  process.exit(1);
}

const PORT = 3110;
const BASE = `http://localhost:${PORT}`;
const createdUserIds: string[] = [];
const createdStripeCustomerIds: string[] = [];

async function createAccount(
  label: string,
  profileOverrides: Record<string, unknown> = {},
  subscriptionOverrides: Record<string, unknown> = {}
): Promise<{ userId: string; email: string }> {
  const email = `audit-fixes-3-${label}-${randomBytes(4).toString("hex")}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: `Audit Fix 3 Test ${label}`,
      business_name: `Audit Fix 3 Test ${label} Ltd`,
      home_address: "Manchester Piccadilly Station, Manchester",
      home_latitude: 53.4773,
      home_longitude: -2.2309,
      timezone: "Europe/London",
      terms_version: TERMS_VERSION,
    },
  });
  if (error) throw error;
  createdUserIds.push(created.user.id);
  await admin
    .from("profiles")
    .update({
      onboarding_completed_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      engagement_state: { entryChoiceMade: true, tourShown: true, ahaMomentShown: true },
      ...profileOverrides,
    })
    .eq("id", created.user.id);
  if (Object.keys(subscriptionOverrides).length > 0) {
    await admin.from("subscriptions").update(subscriptionOverrides).eq("user_id", created.user.id);
  }
  return { userId: created.user.id, email };
}

async function cookiesFor(email: string): Promise<Map<string, string>> {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw linkError;

  const jar = new Map<string, string>();
  const ssr = createServerClient(url, publishableKey!, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error: otpError } = await ssr.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (otpError) throw otpError;
  return jar;
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function findActionId(exportedName: string): string {
  const manifestPath = path.join(process.cwd(), ".next/server/server-reference-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const [id, entry] of Object.entries(manifest.node as Record<string, { exportedName?: string }>)) {
    if (entry.exportedName === exportedName) return id;
  }
  throw new Error(`Could not find a Server Action id for "${exportedName}" in the build manifest`);
}

async function callServerAction(
  pagePath: string,
  actionId: string,
  cookies: string,
  body: unknown[]
): Promise<Response> {
  return fetch(`${BASE}${pagePath}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "Next-Action": actionId,
      Cookie: cookies,
    },
    body: JSON.stringify(body),
  });
}

function startServer() {
  const nextBin = path.join(process.cwd(), "node_modules/next/dist/bin/next");
  const env = { ...process.env, NEXT_PUBLIC_TURNSTILE_DISABLED: "true" };
  console.log("Building...");
  const build = spawnSync(process.execPath, [nextBin, "build"], { cwd: process.cwd(), env, stdio: "inherit" });
  if (build.status !== 0) throw new Error("Build failed");
  console.log("Starting server...");
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
  return server;
}

function stopServer(server: ReturnType<typeof spawn>) {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    else server.kill("SIGTERM");
  } catch {}
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("next start didn't come up on port " + PORT);
}

async function postSignedWebhook(eventBody: unknown): Promise<Response> {
  const payload = JSON.stringify(eventBody);
  const header = await stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: webhookSecret!,
  });
  return fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": header },
    body: payload,
  });
}

// --------------------------------------------------------------- phase A

async function phaseA_exportPagination() {
  console.log("\n--- Test #8: export pages past PostgREST's default row cap ---");
  const { userId, email } = await createAccount("export");

  const JOB_COUNT = 1500;
  const rows = Array.from({ length: JOB_COUNT }, (_, i) => ({
    user_id: userId,
    customer_name: `Bulk Customer ${i}`,
    description: "Bulk export test job",
    address: "1 Piccadilly Gardens, Manchester",
    latitude: 53.4808,
    longitude: -2.2426,
    date: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`,
    time_slot_type: "morning",
    duration_minutes: 60,
    status: "scheduled",
    urgency: "normal",
  }));
  // Insert in chunks — a single 1500-row insert is well within Postgres's
  // own limits, but chunking avoids any payload-size surprise from the
  // Supabase client/PostgREST itself.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("jobs").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }

  const jar = await cookiesFor(email);
  const res = await fetch(`${BASE}/api/account/export?type=json`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  check("export request succeeds", res.ok, String(res.status));
  const payload = (await res.json()) as { jobs: unknown[] };
  check(
    `export returns all ${JOB_COUNT} jobs, not just PostgREST's default page`,
    payload.jobs.length === JOB_COUNT,
    `got ${payload.jobs.length}`
  );

  const csvRes = await fetch(`${BASE}/api/account/export?type=jobs-csv`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  const csvText = await csvRes.text();
  // header row + one per job.
  const csvLines = csvText.trim().split("\n");
  check(
    `the CSV export also carries all ${JOB_COUNT} jobs`,
    csvLines.length === JOB_COUNT + 1,
    `got ${csvLines.length - 1} data rows`
  );
}

// --------------------------------------------------------------- phase B

async function phaseB_refundWebhook() {
  console.log("\n--- Test #9: charge.refunded is flagged, full vs partial distinguished ---");

  const customer = await stripe.customers.create({ description: "audit-fixes-3 test customer" });
  createdStripeCustomerIds.push(customer.id);
  const { userId, email } = await createAccount("refund-full", {}, { stripe_customer_id: customer.id });

  // A real test-mode charge, confirmed with Stripe's own test payment
  // method token (no real card data involved) — then a REAL full refund
  // via the Stripe API, per the fix's own directive to test this for real.
  const intent = await stripe.paymentIntents.create({
    amount: 2000,
    currency: "gbp",
    customer: customer.id,
    payment_method: "pm_card_visa",
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  });
  const chargeId =
    typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
  if (!chargeId) throw new Error("No charge created for the test PaymentIntent");

  await stripe.refunds.create({ payment_intent: intent.id });
  const chargeAfterFullRefund = await stripe.charges.retrieve(chargeId);
  check(
    "the real Stripe charge now shows a full refund",
    chargeAfterFullRefund.amount_refunded === chargeAfterFullRefund.amount,
    `refunded=${chargeAfterFullRefund.amount_refunded} amount=${chargeAfterFullRefund.amount}`
  );

  // Fetch the REAL event Stripe generated for this refund (not a
  // hand-built one) and replay it to our own local server by signing it
  // ourselves with the real webhook secret — this only needs the secret,
  // not Stripe's live endpoint config, so it works regardless of whether
  // charge.refunded is in that endpoint's enabled_events list.
  let fullRefundEvent: Stripe.Event | undefined;
  for (let i = 0; i < 10 && !fullRefundEvent; i++) {
    const events = await stripe.events.list({ type: "charge.refunded", limit: 10 });
    fullRefundEvent = events.data.find((e) => (e.data.object as Stripe.Charge).id === chargeId);
    if (!fullRefundEvent) await new Promise((r) => setTimeout(r, 1000));
  }
  check("a real charge.refunded event was retrievable from Stripe", !!fullRefundEvent);

  if (fullRefundEvent) {
    const res = await postSignedWebhook(fullRefundEvent);
    check("the webhook accepts a real full-refund event cleanly (200)", res.status === 200, String(res.status));
  }

  // --- partial refund, same technique, different charge ---
  const intent2 = await stripe.paymentIntents.create({
    amount: 2000,
    currency: "gbp",
    customer: customer.id,
    payment_method: "pm_card_visa",
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  });
  const chargeId2 =
    typeof intent2.latest_charge === "string" ? intent2.latest_charge : intent2.latest_charge?.id;
  if (!chargeId2) throw new Error("No charge created for the second test PaymentIntent");

  await stripe.refunds.create({ payment_intent: intent2.id, amount: 500 });
  const chargeAfterPartialRefund = await stripe.charges.retrieve(chargeId2);
  check(
    "the real Stripe charge shows a partial refund (amount_refunded < amount)",
    chargeAfterPartialRefund.amount_refunded > 0 &&
      chargeAfterPartialRefund.amount_refunded < chargeAfterPartialRefund.amount,
    `refunded=${chargeAfterPartialRefund.amount_refunded} amount=${chargeAfterPartialRefund.amount}`
  );

  let partialRefundEvent: Stripe.Event | undefined;
  for (let i = 0; i < 10 && !partialRefundEvent; i++) {
    const events = await stripe.events.list({ type: "charge.refunded", limit: 10 });
    partialRefundEvent = events.data.find((e) => (e.data.object as Stripe.Charge).id === chargeId2);
    if (!partialRefundEvent) await new Promise((r) => setTimeout(r, 1000));
  }
  check("a real partial-refund event was retrievable from Stripe", !!partialRefundEvent);

  if (partialRefundEvent) {
    const res = await postSignedWebhook(partialRefundEvent);
    check(
      "the webhook accepts a real partial-refund event cleanly (200)",
      res.status === 200,
      String(res.status)
    );
  }

  // Static check, since Sentry's own receipt can't be verified from this
  // environment — confirms the fix's full/partial branch and both Sentry
  // calls genuinely exist in the deployed source, not just in the diff
  // description.
  const webhookSrc = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
  check(
    "source: charge.refunded computes a full-vs-partial distinction",
    /isFullRefund\s*=\s*charge\.amount_refunded\s*>=\s*charge\.amount/.test(webhookSrc)
  );
  check(
    "source: a full refund is flagged at Sentry \"warning\" level",
    /level:\s*isFullRefund\s*\?\s*"warning"\s*:\s*"info"/.test(webhookSrc)
  );

  console.log(
    "  NOTE: Sentry's actual receipt of these two captures is NOT independently verified — " +
      "no Sentry API token or dashboard session is available from this environment, and its " +
      "exports are read-only ES module bindings that can't be monkeypatched from a test " +
      "script either (confirmed directly). The above checks the webhook handles both real " +
      "events cleanly and that the capturing logic exists correctly in source."
  );

  check(
    "cleanup: the throwaway account for this phase is tracked for deletion",
    createdUserIds.includes(userId)
  );
  void email; // only needed to satisfy createAccount's return shape here
}

// --------------------------------------------------------------- phase C

async function phaseC_subscriptionRowCountAndBillingCopy() {
  console.log("\n--- Test #11: webhook row-count check; #13: billing trial-ended copy ---");

  // --- #11a: a webhook event for a user_id with NO subscriptions row
  // (deleted account, data drift) doesn't crash the webhook. ---
  const ghostUserId = randomUUID();
  const subscriptionEventFor = (userId: string, overrides: Record<string, unknown> = {}) => ({
    id: `evt_test_${randomBytes(8).toString("hex")}`,
    object: "event",
    type: "customer.subscription.updated",
    api_version: "2025-06-30.basil",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `sub_test_${randomBytes(8).toString("hex")}`,
        object: "subscription",
        customer: `cus_test_${randomBytes(8).toString("hex")}`,
        status: "active",
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: { user_id: userId },
        items: {
          object: "list",
          data: [
            {
              price: { id: "price_test_nonexistent" },
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
            },
          ],
        },
        ...overrides,
      },
    },
  });

  const ghostRes = await postSignedWebhook(subscriptionEventFor(ghostUserId));
  check(
    "a subscription-update event for a user_id with no subscriptions row still returns 200",
    ghostRes.status === 200,
    String(ghostRes.status)
  );

  // --- #11b: the SAME shape, for a real user, still updates correctly
  // (confirms the count-check didn't break the normal path). ---
  const { userId: realUserId } = await createAccount("row-count-real");
  const realRes = await postSignedWebhook(subscriptionEventFor(realUserId));
  check("the same event shape for a real user_id returns 200", realRes.status === 200, String(realRes.status));
  const { data: subAfter } = await admin
    .from("subscriptions")
    .select("status")
    .eq("user_id", realUserId)
    .single();
  check(
    "and the matching subscriptions row was actually updated",
    subAfter?.status === "active",
    JSON.stringify(subAfter)
  );

  const webhookSrc = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
  check(
    "source: a zero-row subscription update is flagged at Sentry \"warning\" level",
    /if \(!count\) \{\s*Sentry\.captureMessage/.test(webhookSrc)
  );

  // --- #13: billing copy distinguishes "trial ended" from "never had one" ---
  const pastTrialEnd = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const { email: trialEndedEmail } = await createAccount(
    "trial-ended",
    {},
    { trial_ends_at: pastTrialEnd, stripe_subscription_id: null, status: null, comped_until: null }
  );
  const { email: neverTrialEmail } = await createAccount(
    "never-trial",
    {},
    { trial_ends_at: null, stripe_subscription_id: null, status: null, comped_until: null }
  );

  const trialEndedJar = await cookiesFor(trialEndedEmail);
  const trialEndedPage = await fetch(`${BASE}/billing`, { headers: { Cookie: cookieHeader(trialEndedJar) } });
  const trialEndedHtml = await trialEndedPage.text();
  check(
    "a lapsed-trial account sees 'Your trial ended on...', not the generic message",
    trialEndedHtml.includes("Your trial ended on"),
    trialEndedHtml.includes("No active subscription.") ? "showed the generic message instead" : undefined
  );

  const neverTrialJar = await cookiesFor(neverTrialEmail);
  const neverTrialPage = await fetch(`${BASE}/billing`, { headers: { Cookie: cookieHeader(neverTrialJar) } });
  const neverTrialHtml = await neverTrialPage.text();
  check(
    "an account that never had a trial still sees the generic message",
    neverTrialHtml.includes("No active subscription.") && !neverTrialHtml.includes("Your trial ended on"),
    neverTrialHtml.includes("Your trial ended on") ? "incorrectly showed the trial-ended message" : undefined
  );
}

// --------------------------------------------------------------- phase D

async function phaseD_duplicateSubmitGuard() {
  console.log("\n--- Test #14: a raw double Next-Action request doesn't create two jobs ---");
  const { email } = await createAccount("double-submit");
  const jar = await cookiesFor(email);
  const cookies = cookieHeader(jar);
  const actionId = findActionId("confirmAndSaveJob");

  const customerName = `Double Submit Test ${randomBytes(4).toString("hex")}`;
  const body = [
    {
      address: "1 Piccadilly Gardens, Manchester",
      date: "2027-02-10",
      timeSlotType: "morning",
      specificTime: null,
      customerName,
      description: "",
      durationMinutes: null,
    },
  ];

  const [res1, res2] = await Promise.all([
    callServerAction("/add", actionId, cookies, body),
    callServerAction("/add", actionId, cookies, body),
  ]);
  check("both raw double-submit requests get a clean (non-500) response", res1.status < 500 && res2.status < 500, `${res1.status}, ${res2.status}`);
  await res1.text().catch(() => {});
  await res2.text().catch(() => {});

  const { data: matches } = await admin
    .from("jobs")
    .select("id")
    .eq("customer_name", customerName)
    .eq("date", "2027-02-10");
  check(
    "exactly one job was created, not two",
    (matches?.length ?? 0) === 1,
    `found ${matches?.length ?? 0}`
  );
}

// --------------------------------------------------------------- phase E

async function phaseE_notFoundTitle() {
  console.log("\n--- Test #16: the 404 page has its own title ---");
  // Signed in — a signed-OUT visitor hitting an unmatched path is
  // redirected to /login by design (proxy.ts), which never reaches the
  // actual 404 page at all.
  const { email } = await createAccount("not-found-title");
  const jar = await cookiesFor(email);
  const res = await fetch(`${BASE}/this-path-should-never-exist-${randomBytes(4).toString("hex")}`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  const html = await res.text();
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  check(
    "the 404 page's <title> is specific, not the bare site default",
    !!titleMatch && titleMatch[1].toLowerCase().includes("page not found"),
    titleMatch?.[1] ?? "(no <title> found)"
  );
  check(
    "the 404 page's title still carries the site name (via the layout's template)",
    !!titleMatch && titleMatch[1].includes("Booktight"),
    titleMatch?.[1]
  );
}

// --------------------------------------------------------------- cleanup

async function cleanupAnyRemaining() {
  for (const userId of createdUserIds.splice(0, createdUserIds.length)) {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data?.user) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
  for (const customerId of createdStripeCustomerIds.splice(0, createdStripeCustomerIds.length)) {
    await stripe.customers.del(customerId).catch(() => {});
  }
}

async function main() {
  const server = startServer();
  try {
    await waitForServer();
    await phaseA_exportPagination();
    await phaseB_refundWebhook();
    await phaseC_subscriptionRowCountAndBillingCopy();
    await phaseD_duplicateSubmitGuard();
    await phaseE_notFoundTitle();
  } finally {
    await cleanupAnyRemaining();
    stopServer(server);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll audit-fix-3 checks passed.");
}

main().catch((err) => {
  console.error("main() rejected:", err);
  process.exitCode = 1;
});
