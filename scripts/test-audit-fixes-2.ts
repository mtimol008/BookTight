// RUNS AGAINST A REAL DATABASE — staging by default, never production
// without an explicit, unambiguous override (see scripts/lib/supabaseTarget.ts).
//
// Regression tests for 5 of the fixes made from the full-app audit
// (findings #1-#7; #6 needed no code change — see below; #7 is split
// between a live integration check here and a deterministic check of the
// library primitive it depends on, for reasons explained at phase 4):
//
//   #1 geocodeAddress's throw (Mapbox failure/rate-limit/missing-token)
//      escaped every call site in actions.ts uncaught, crashing the
//      add/edit-job flow to the error boundary and discarding the user's
//      typed form. Fixed via safeGeocodeAddress, returning an ActionResult
//      instead. Phase 1 (poisoned Mapbox token).
//   #2 Same unguarded-throw shape in billing/actions.ts's two Stripe
//      session-creation calls. Fixed with try/catch around both, routed
//      through the existing redirectWithError helper. Phase 1 (poisoned
//      Stripe secret key, same server).
//   #3 ical.ts's DESCRIPTION pre-joined lines with an already-escaped
//      "\\n", which escapeICalText then double-escaped — every job in
//      every feed showed a literal \n instead of a line break. Fixed by
//      joining with a real newline. Phase 0 (pure, no server).
//   #4 ical.ts built DTSTART/DTEND via raw local-Date overflow, using the
//      SERVER's own runtime timezone — produced a wrong DTEND depending
//      purely on server TZ for any job spanning a UK DST transition.
//      Fixed via week.ts's new zonedWallTimeToUtc, Intl-based like the
//      rest of week.ts. Phase 0 — run under BOTH TZ=UTC and
//      TZ=Europe/London, asserting an IDENTICAL, correct result, which is
//      the actual bug signature.
//   #5 jobs.ts's updateJob had no user_id filter (unlike its siblings) and
//      threw uncaught via .single() on a 0-row race. Fixed with the filter
//      (defense-in-depth; RLS already blocked the cross-account case) and
//      .maybeSingle() + a catchable JobNotFoundError. Phase 2.
//   #6 Audited as "no lapsed/read-only banner anywhere outside /billing" —
//      turned out to already exist (AppShell's billingBanner, rendered via
//      a client-side useEffect) and was very likely a false positive from
//      checking server-rendered HTML before that effect runs. No code
//      change made. Phase 2 verifies the existing banner for real, with JS
//      executed.
//   #7 Several "today"/"this week" call sites defaulted to server (UTC)
//      time instead of the profile's timezone (page.tsx, actions.ts,
//      the calendar feed route). Fixed by threading profile.timezone
//      through each. Phase 4 explains why this is checked as a
//      deterministic library-primitive + source-pattern check rather than
//      a live, time-of-day-dependent browser run.
//
// Builds and starts its own throwaway `next start` instances pointed at
// the resolved target, signs in via the magic-link-to-cookie-jar technique
// (same as scripts/test-security-fixes.ts). Tears servers down and
// deletes every account it creates, even on failure.
//
//   npm run test:audit-fixes-2                                     # staging
//   npm run test:audit-fixes-2 -- --target=production --i-really-mean-production
//   npx tsx scripts/test-audit-fixes-2.ts --ical-worker             # internal, see phase0()
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exitCode = 1;
});

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync, execSync } from "node:child_process";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright";
import { resolveTarget } from "./lib/supabaseTarget";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!pass) failures++;
}

// ------------------------------------------------------- ical worker mode
// Invoked as a child process so phase0() can genuinely run this under two
// different TZ env vars and compare — not just call the same in-process
// function twice, which would prove nothing about the actual bug (the
// server's own runtime timezone leaking into the calculation).
async function icalWorkerMain() {
  const { jobToICalEvent, generateICalFeed } = await import("../src/lib/ical");
  const job = {
    id: "11111111-aaaa-bbbb-cccc-222222222222",
    address: "1 Test Street, Manchester",
    latitude: 53.48,
    longitude: -2.24,
    date: "2027-03-28", // the night UK clocks spring forward
    time_slot_type: "specific",
    specific_time: "23:30",
    customer_name: "DST Test Customer",
    description: "Line one, with a comma\nLine two",
    duration_minutes: 90,
    manual_position: null,
    status: "scheduled",
    urgency: "normal",
    created_at: new Date().toISOString(),
  } as unknown as import("../src/lib/jobs").JobRecord;

  const event = jobToICalEvent(
    job,
    "https://booktight.co.uk",
    { jobId: job.id, startMinutes: 23 * 60 + 30, endMinutes: 23 * 60 + 30 + 90 },
    "Europe/London"
  );
  const feed = generateICalFeed([event], "Europe/London");
  const dtEndLine = feed.split("\r\n").find((l) => l.startsWith("DTEND")) ?? "";
  const descriptionLine = feed.split("\r\n").find((l) => l.startsWith("DESCRIPTION")) ?? "";

  process.stdout.write(
    JSON.stringify({ processTZ: process.env.TZ ?? "(unset)", dtEndLine, descriptionLine })
  );
}

// A child process spawned with --ical-worker must do ONLY this and
// nothing else in the file below — a plain if/else (not .then(), which
// doesn't block the synchronous code that follows it) so the setup
// section's own console.log (inside resolveTarget) never leaks into this
// child's stdout, which the parent process parses as JSON.
const isIcalWorker = process.argv.includes("--ical-worker");

// ----------------------------------------------------------------- setup
// Declared up here (not as const assigned inline) so every helper function
// below can close over them, but the real assignment — including
// resolveTarget()'s own console.log — only happens in the branch below,
// never for an --ical-worker child.

let url = "";
let secretKey = "";
let publishableKey: string | undefined;
let admin: SupabaseClient;
let TERMS_VERSION = "";

const PORT = 3109;
const BASE = `http://localhost:${PORT}`;
const createdUserIds: string[] = [];

if (!isIcalWorker) {
  let creds: ReturnType<typeof resolveTarget>;
  try {
    creds = resolveTarget();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  url = creds.url;
  secretKey = creds.secretKey;
  publishableKey = creds.publishableKey;
  if (!publishableKey) {
    console.error(
      "Missing a publishable key for this target (STAGING_SUPABASE_PUBLISHABLE_KEY for staging, " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for production) — needed to build a real session."
    );
    process.exit(1);
  }
  admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  TERMS_VERSION = readFileSync("src/lib/terms.ts", "utf8").match(
    /TERMS_VERSION\s*=\s*"([^"]+)"/
  )![1];
}

async function createAccount(label: string): Promise<{ userId: string; email: string }> {
  const email = `audit-fixes-2-${label}-${randomBytes(4).toString("hex")}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: `Audit Fix Test ${label}`,
      business_name: `Audit Fix Test ${label} Ltd`,
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
    })
    .eq("id", created.user.id);
  return { userId: created.user.id, email };
}

async function createJobFor(userId: string, date: string, customerName: string): Promise<string> {
  const { data, error } = await admin
    .from("jobs")
    .insert({
      user_id: userId,
      customer_name: customerName,
      description: "Audit fix test job",
      address: "1 Piccadilly Gardens, Manchester",
      latitude: 53.4808,
      longitude: -2.2426,
      date,
      time_slot_type: "morning",
      duration_minutes: 60,
      status: "scheduled",
      urgency: "normal",
    })
    .select()
    .single();
  if (error) throw error;
  return data.id as string;
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

function startServer(extraEnv: Record<string, string>) {
  const nextBin = path.join(process.cwd(), "node_modules/next/dist/bin/next");
  const env = { ...process.env, NEXT_PUBLIC_TURNSTILE_DISABLED: "true", ...extraEnv };
  console.log(`Building (${Object.keys(extraEnv).join(", ") || "normal env"})...`);
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

// ---------------------------------------------------- phase 0: ical (pure)

function runIcalWorker(tz: string): { processTZ: string; dtEndLine: string; descriptionLine: string } {
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), __filename, "--ical-worker"],
    { cwd: process.cwd(), env: { ...process.env, TZ: tz }, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`ical worker failed under TZ=${tz}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

async function phase0_icalFixes() {
  console.log("\n--- Test #3/#4: ical description escaping and DST-safe clock times ---");

  const underUtc = runIcalWorker("UTC");
  const underLondon = runIcalWorker("Europe/London");

  check(
    "worker actually ran under the intended process TZ (UTC)",
    underUtc.processTZ === "UTC",
    underUtc.processTZ
  );
  check(
    "worker actually ran under the intended process TZ (Europe/London)",
    underLondon.processTZ === "Europe/London",
    underLondon.processTZ
  );

  // The bug: before the fix, this line differed between the two runs
  // (20270328T010000Z-equivalent wall time under one TZ, 02:00 under the
  // other) purely because of the server's own unrelated runtime timezone.
  check(
    "DTEND is identical regardless of the server's own runtime TZ",
    underUtc.dtEndLine === underLondon.dtEndLine && underUtc.dtEndLine.length > 0,
    `UTC="${underUtc.dtEndLine}" London="${underLondon.dtEndLine}"`
  );
  // 23:30 + 90 minutes, spanning the 01:00 GMT -> 02:00 BST jump, should
  // land at the correct local wall-clock time on the far side of it.
  check(
    "DTEND reads a plausible post-transition local time (01:00 BST, the 29th)",
    underUtc.dtEndLine.includes("20270329T010000"),
    underUtc.dtEndLine
  );

  check(
    "DESCRIPTION contains a real escaped newline (\\n), not a literal double-backslash",
    underUtc.descriptionLine.includes("\\n") && !underUtc.descriptionLine.includes("\\\\n"),
    underUtc.descriptionLine
  );
  // The job's own description already contained a real comma and a real
  // newline — confirms the single escaping pass still handles genuine
  // user content correctly, not just the artificial line-joining.
  check(
    "a user-typed comma inside the description is still escaped exactly once",
    underUtc.descriptionLine.includes("Line one\\, with a comma"),
    underUtc.descriptionLine
  );
}

// --------------------------------------------- phase 1: poisoned-env server

async function phase1_geocodeAndStripeErrors() {
  console.log("\n--- Test #1/#2: Mapbox/Stripe failures show a clean message, not a crash ---");
  const server = startServer({
    MAPBOX_ACCESS_TOKEN: "pk.poisoned-for-this-test-only",
    STRIPE_SECRET_KEY: "sk_test_poisoned_for_this_test_only",
  });
  try {
    await waitForServer();
    const { email } = await createAccount("geocode");
    const jar = await cookiesFor(email);
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      await context.addCookies(
        [...jar.entries()].map(([name, value]) => ({
          name,
          value,
          domain: "localhost",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax" as const,
        }))
      );
      const page = await context.newPage();

      // --- #1: add-job flow with a poisoned Mapbox token ---
      await page.goto(`${BASE}/add`);
      const addressValue = "999 Poisoned Mapbox Test Road, Manchester";
      const customerValue = "Poisoned Mapbox Test Customer";
      await page.locator("#job-address").fill(addressValue);
      await page.locator("#job-customer").fill(customerValue);
      // requestSubmit(), not .click() — the fixed bottom nav bar sits
      // close enough to this button at the default viewport that a plain
      // click on it was unreliable in this harness (confirmed by
      // comparing network traffic: .click() never produced a request to
      // getSchedulingSuggestion's action id at all, while requestSubmit()
      // reliably does). A real user tapping the button is unaffected —
      // this is purely about this headless click landing precisely.
      await page.evaluate(() => document.querySelector("form")?.requestSubmit());

      const errorText = page.locator(".error-text");
      await errorText.first().waitFor({ timeout: 10_000 }).catch(() => {});
      const shownError = await errorText.first().textContent().catch(() => null);
      check(
        "a poisoned Mapbox token shows a clean inline message, not a crash",
        !!shownError && shownError.includes("Couldn't verify that address"),
        shownError ?? "(no error text found)"
      );
      check("the page never navigated away from /add", page.url() === `${BASE}/add`, page.url());
      check(
        "the typed address is still in the field — form data wasn't lost",
        (await page.locator("#job-address").inputValue()) === addressValue
      );
      check(
        "the typed customer name is still in the field — form data wasn't lost",
        (await page.locator("#job-customer").inputValue()) === customerValue
      );

      // Cross-check with a direct, deterministic Server Action call —
      // the browser-driven check above proves the UI doesn't crash and
      // keeps the form, but is at the mercy of React's own timing; this
      // proves the actual returned message content without that risk.
      const suggestionActionId = findActionId("getSchedulingSuggestion");
      const rawRes = await callServerAction("/add", suggestionActionId, cookieHeader(jar), [
        "123 Another Poisoned Mapbox Road, Manchester",
        { type: "none" },
        null,
        null,
      ]);
      const rawText = await rawRes.text();
      check(
        "getSchedulingSuggestion's raw response carries the clean message, not a crash",
        rawRes.status < 500 && rawText.includes("Couldn't verify that address"),
        `status=${rawRes.status} bodyHasMessage=${rawText.includes("Couldn't verify that address")}`
      );

      // --- #2: billing checkout with a poisoned Stripe secret key ---
      await page.goto(`${BASE}/billing`);
      const monthlyForm = page.locator('form[action]').filter({ hasText: "Monthly" }).first();
      // Fall back to clicking any button whose form submits the "monthly"
      // plan if the exact text match above doesn't line up with the
      // page's real copy — the important thing is submitting
      // createCheckoutSession, not the button's exact wording.
      const monthlyButton = (await monthlyForm.count())
        ? monthlyForm.locator("button")
        : page.getByRole("button", { name: /month/i }).first();
      await monthlyButton.click();
      await page.waitForURL(/\/billing\?error=/, { timeout: 10_000 }).catch(() => {});
      const billingUrl = page.url();
      check(
        "a poisoned Stripe key redirects to /billing with a clean error, not a crash",
        billingUrl.includes("/billing?error="),
        billingUrl
      );
      const billingError = await page.locator(".error-text").first().textContent().catch(() => null);
      check(
        "the billing error message is the clean one from redirectWithError",
        !!billingError && billingError.toLowerCase().includes("checkout"),
        billingError ?? "(no error text found)"
      );
    } finally {
      await browser.close();
    }
  } finally {
    await cleanupAnyRemaining();
    stopServer(server);
  }
}

// ----------------------------------------------- phase 2: normal-env server

async function phase2_updateJobAndBanner() {
  console.log("\n--- Test #5: updateJob ownership + 0-row handling; #6: lapsed banner (live, with JS) ---");
  const server = startServer({ PAYWALL_ENABLED: "true", PAYWALL_LIVE_FROM: "2020-01-01" });
  try {
    await waitForServer();

    // --- #5a: cross-account updateJob is rejected cleanly ---
    const accountA = await createAccount("ownerA");
    const accountB = await createAccount("ownerB");
    const jobA = await createJobFor(accountA.userId, "2027-05-10", "Owner A's Customer");
    const jobB = await createJobFor(accountB.userId, "2027-05-11", "Owner B's Customer");

    const jarA = await cookiesFor(accountA.email);
    const cookiesA = cookieHeader(jarA);
    const updateActionId = findActionId("updateExistingJob");

    const crossAccountRes = await callServerAction("/", updateActionId, cookiesA, [
      {
        id: jobB,
        address: "1 Piccadilly Gardens, Manchester",
        date: "2027-05-12",
        timeSlotType: "morning",
        specificTime: null,
        customerName: "Hijacked",
        description: "",
        durationMinutes: null,
      },
    ]);
    check("a cross-account updateJob call doesn't 500", crossAccountRes.status < 500, String(crossAccountRes.status));
    await crossAccountRes.text().catch(() => {});

    const { data: jobBAfter } = await admin.from("jobs").select("customer_name, date").eq("id", jobB).single();
    check(
      "the other account's job is completely unchanged",
      jobBAfter?.customer_name === "Owner B's Customer" && jobBAfter?.date === "2027-05-11",
      JSON.stringify(jobBAfter)
    );

    // --- #5b: updating an already-deleted job returns a clean error ---
    await admin.from("jobs").delete().eq("id", jobA);
    const deletedRes = await callServerAction("/", updateActionId, cookiesA, [
      {
        id: jobA,
        address: "1 Piccadilly Gardens, Manchester",
        date: "2027-05-12",
        timeSlotType: "morning",
        specificTime: null,
        customerName: "Ghost Job",
        description: "",
        durationMinutes: null,
      },
    ]);
    check(
      "updating an already-deleted job doesn't 500 (clean ActionResult instead)",
      deletedRes.status < 500,
      String(deletedRes.status)
    );

    // --- #6: the lapsed/read-only banner, live, with real JS execution ---
    const lapsedAccount = await createAccount("lapsed");
    // Deliberately leaves stripe_subscription_id null — lapsedSince()
    // reads trial_ends_at only in that case; setting it non-null with no
    // current_period_end would fall through to its epoch fallback and
    // show a different (still correct, just differently-worded) banner.
    await admin
      .from("subscriptions")
      .update({
        status: "canceled",
        trial_ends_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
        stripe_subscription_id: null,
        comped_until: null,
      })
      .eq("user_id", lapsedAccount.userId);

    const lapsedJar = await cookiesFor(lapsedAccount.email);
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      await context.addCookies(
        [...lapsedJar.entries()].map(([name, value]) => ({
          name,
          value,
          domain: "localhost",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax" as const,
        }))
      );
      const page = await context.newPage();
      await page.goto(`${BASE}/`);
      const banner = page.locator(".billing-banner");
      await banner.first().waitFor({ timeout: 10_000 }).catch(() => {});
      const bannerText = await banner.first().textContent().catch(() => null);
      check(
        "a lapsed account sees the read-only banner on / once the client fetch resolves",
        !!bannerText && bannerText.toLowerCase().includes("read-only"),
        bannerText ?? "(no banner found)"
      );

      await page.goto(`${BASE}/calendar`);
      const calendarBanner = page.locator(".billing-banner");
      await calendarBanner.first().waitFor({ timeout: 10_000 }).catch(() => {});
      const calendarBannerText = await calendarBanner.first().textContent().catch(() => null);
      check(
        "the same banner appears on /calendar",
        !!calendarBannerText && calendarBannerText.toLowerCase().includes("read-only"),
        calendarBannerText ?? "(no banner found)"
      );
    } finally {
      await browser.close();
    }
  } finally {
    await cleanupAnyRemaining();
    stopServer(server);
  }
}

// -------------------------------------------- phase 3: #7, source + primitive

async function phase3_timezoneThreading() {
  console.log("\n--- Test #7: profile-timezone threading for \"today\"/\"this week\" ---");
  console.log(
    "Note: this is checked deterministically rather than via a live browser run at an " +
      "arbitrary real moment, since whether UTC-\"today\" and a given profile timezone's " +
      "\"today\" actually differ depends on what time it happens to be when this test runs " +
      "— not something a repeatable regression test should depend on. Instead: (a) the " +
      "underlying Intl-based primitive is exercised directly with a FIXED instant known to " +
      "straddle a day boundary between UTC and a far timezone, and (b) each fixed call site " +
      "is confirmed to actually pass a timezone-derived reference date rather than defaulting."
  );

  // getTodayDateString's default arg reads LOCAL (process-runtime) getters,
  // not UTC explicitly — fine on Vercel (which runs in UTC) but not a safe
  // thing for this test script itself to depend on, since its own shell's
  // timezone is unrelated. Comparing two explicit timeZone values instead
  // removes that dependency entirely.
  const { getTodayDateStringInTimezone } = await import("../src/lib/week");
  const fixedInstant = new Date("2027-06-14T23:30:00Z");
  const utcToday = getTodayDateStringInTimezone("UTC", fixedInstant);
  const aucklandToday = getTodayDateStringInTimezone("Pacific/Auckland", fixedInstant);
  check(
    "the TZ-aware primitive itself correctly disagrees with UTC at a day boundary",
    utcToday === "2027-06-14" && aucklandToday === "2027-06-15",
    `utc=${utcToday} auckland=${aucklandToday}`
  );

  const pageSrc = readFileSync("src/app/page.tsx", "utf8");
  check(
    "page.tsx's currentWeek no longer defaults to a bare server now()",
    /getCurrentWeekRange\(new Date\(today \+ "T00:00:00"\)\)/.test(pageSrc)
  );

  const actionsSrc = readFileSync("src/app/actions.ts", "utf8");
  check(
    "actions.ts's getSchedulingSuggestion week window is anchored to the user's own today",
    /getCurrentWeekRange\(\s*new Date\(now\.todayDate \+ "T00:00:00"\)\s*\)/.test(actionsSrc)
  );

  const feedSrc = readFileSync("src/app/api/calendar/feed/[token]/route.ts", "utf8");
  check(
    "the calendar feed route anchors its 12-week window to the feed owner's own today",
    /getCurrentWeekRange\(new Date\(today \+ "T00:00:00"\)\)/.test(feedSrc) &&
      /getTodayDateStringInTimezone\(profile\.timezone\)/.test(feedSrc)
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
}

async function main() {
  await phase0_icalFixes();
  await phase1_geocodeAndStripeErrors();
  await phase2_updateJobAndBanner();
  await phase3_timezoneThreading();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll audit-fix checks passed.");
}

if (isIcalWorker) {
  icalWorkerMain()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else {
  main().catch((err) => {
    console.error("main() rejected:", err);
    process.exitCode = 1;
  });
}
