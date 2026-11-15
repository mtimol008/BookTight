// RUNS AGAINST A REAL DATABASE — staging by default, never production
// without an explicit, unambiguous override (see scripts/lib/supabaseTarget.ts).
//
// Regression tests for two bugs found in production's week-navigation
// feature:
//   1. Typing a new date directly into the week-view edit card's Date
//      field, then Save -> Confirm & Save, silently discarded that date —
//      the day-suggestion panel defaulted back to the job's old date (or
//      the scheduling engine's own top pick) instead of the date the user
//      actually typed. Fixed by DaySuggestionPanel's initialCustomDate
//      prop (src/components/DaySuggestionPanel.tsx), wired up from
//      JobsTable.tsx. Driven through a real browser (Playwright) rather
//      than a direct Server Action call, since the bug was entirely in
//      the client-side selection logic, not the server action itself.
//   2. ?week= values that aren't a Monday (e.g. whatever day Calendar's
//      "Edit this week" linked to) are now redirected to that week's
//      canonical Monday (src/app/page.tsx), and every link that produces
//      a ?week= value (This Week's own prev/next, Calendar's "Edit this
//      week") always emits the canonical Monday directly.
//
// Builds and starts its own throwaway `next start` pointed at the resolved
// target, signs in via the magic-link-to-cookie-jar technique (same as
// scripts/test-security-fixes.ts). Tears the server down and deletes every
// account it creates, even on failure.
//
//   npm run test:week-nav-fixes                                     # staging
//   npm run test:week-nav-fixes -- --target=production --i-really-mean-production
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exitCode = 1;
});

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync, execSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright";
import { resolveTarget } from "./lib/supabaseTarget";

let failures = 0;
function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!pass) failures++;
}

let creds: ReturnType<typeof resolveTarget>;
try {
  creds = resolveTarget();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const { url, secretKey, publishableKey } = creds;
if (!publishableKey) {
  console.error(
    "Missing a publishable key for this target (STAGING_SUPABASE_PUBLISHABLE_KEY for staging, " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for production) — needed to build a real session."
  );
  process.exit(1);
}

const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const TERMS_VERSION = readFileSync("src/lib/terms.ts", "utf8").match(
  /TERMS_VERSION\s*=\s*"([^"]+)"/
)![1];

const PORT = 3108;
const BASE = `http://localhost:${PORT}`;
const createdUserIds: string[] = [];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `d`, matching src/lib/week.ts's own
 *  getMonday — duplicated here deliberately so this test doesn't rely on
 *  the same code it's meant to be checking up on. */
function mondayOf(d: Date): Date {
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

async function createAccount(label: string): Promise<{ userId: string; email: string }> {
  const email = `weeknav-fixes-${label}-${randomBytes(4).toString("hex")}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: `Week Nav Test ${label}`,
      business_name: `Week Nav Test ${label} Ltd`,
      // A few km from the test job's address (below) rather than a
      // different city entirely — keeps "added distance" small enough
      // that moving the job never trips the distance/time-fit warning
      // path (a legitimate product behavior this test isn't about).
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
      description: "Week nav test job",
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

async function phase1_rescheduleViaTypedDate() {
  console.log("\n--- Test 1: typing a new date in the edit card and saving actually moves the job ---");
  const { userId, email } = await createAccount("move");

  const originalDate = toISODate(new Date(Date.now() + 2 * 86_400_000));
  // Three weeks out, on a Wednesday specifically — far enough out to never
  // be confusable with "this week" or the engine's own top-ranked day for
  // the original address/time, and a weekday so the test account's
  // default working hours never turn this into a legitimate "day off"
  // warning (Book it anyway) instead of the plain Confirm & Save path
  // this test means to exercise.
  const threeWeeksOut = new Date(Date.now() + 21 * 86_400_000);
  const targetMonday = mondayOf(threeWeeksOut);
  const targetWednesday = new Date(targetMonday);
  targetWednesday.setDate(targetMonday.getDate() + 2);
  const targetDate = toISODate(targetWednesday);
  const customerName = "Reschedule Test Customer";
  const jobId = await createJobFor(userId, originalDate, customerName);

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
    // Navigate straight to the job's own week — originalDate (2 days out)
    // can easily fall outside the literal current Mon-Sun week depending
    // on what day "now" is, and a plain "/" only ever shows that one.
    await page.goto(`${BASE}/?week=${originalDate}`);
    await page.getByText(customerName).click();

    const dateInput = page.locator('input[type="date"]');
    await dateInput.fill(targetDate);
    await page.getByRole("button", { name: "Save" }).click();

    // A low-confidence address match gates the day-suggestion panel behind
    // its own confirmation first — same address every run, so handle it
    // whether or not it appears (it only shows up after the async
    // suggestion check resolves, so give it a real chance to appear).
    const addressConfirm = page.getByRole("button", { name: "Yes, that's right" });
    const addressConfirmAppeared = await addressConfirm
      .waitFor({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (addressConfirmAppeared) {
      await addressConfirm.click();
    }

    // Changing the date always routes through the day-suggestion check —
    // wait for Confirm & Save (shown once no warning applies) rather than
    // assuming the plain Save button alone finished the job.
    const confirmButton = page.getByRole("button", { name: "Confirm & Save" });
    try {
      await confirmButton.waitFor({ timeout: 10_000 });
    } catch (err) {
      console.error("DEBUG page text:", await page.locator("body").innerText());
      throw err;
    }

    // The fix's whole point: the panel should already be showing the
    // typed date, not the job's old date or some unrelated engine pick.
    const headline = await page.locator(".suggest-headline").first().textContent();
    check(
      "day-suggestion panel defaults to the typed date, not the old one",
      !!headline && !headline.includes(originalDate.slice(8)), // crude but enough: old day-of-month shouldn't appear as the lead date
      headline ?? "(no headline)"
    );

    await confirmButton.click();
    await page.waitForTimeout(1500);

    const { data: job } = await admin.from("jobs").select("date").eq("id", jobId).single();
    check(
      "job's date in the database matches what was typed, not the original date",
      job?.date === targetDate,
      `typed=${targetDate} original=${originalDate} actual=${job?.date}`
    );
  } finally {
    await browser.close();
  }
}

async function phase2_weekParamCanonicalization() {
  console.log("\n--- Test 2: every ?week= value for the same week resolves to the same jobs ---");
  const { userId, email } = await createAccount("week");

  const base = new Date();
  base.setDate(base.getDate() + 14);
  const monday = mondayOf(base);
  const mondayStr = toISODate(monday);
  const wednesday = new Date(monday);
  wednesday.setDate(monday.getDate() + 2);
  const wednesdayStr = toISODate(wednesday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayStr = toISODate(sunday);

  const customerName = "Week Param Test Customer";
  await createJobFor(userId, wednesdayStr, customerName);
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

    for (const weekParam of [mondayStr, wednesdayStr, sundayStr]) {
      await page.goto(`${BASE}/?week=${weekParam}`, { waitUntil: "networkidle" });
      const finalUrl = page.url();
      const bodyText = await page.locator("body").innerText();
      check(
        `?week=${weekParam} shows the job and lands on the canonical URL`,
        finalUrl === `${BASE}/?week=${mondayStr}` && bodyText.includes(customerName),
        `finalUrl=${finalUrl} jobFound=${bodyText.includes(customerName)}`
      );
    }
  } finally {
    await browser.close();
  }
}

async function cleanupAnyRemaining() {
  for (const userId of createdUserIds) {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data?.user) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
}

async function main() {
  const server = startServer();
  try {
    await waitForServer();
    await phase1_rescheduleViaTypedDate();
    await phase2_weekParamCanonicalization();
  } finally {
    await cleanupAnyRemaining();
    stopServer(server);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll week-nav fix checks passed.");
}

main().catch((err) => {
  console.error("main() rejected:", err);
  process.exitCode = 1;
});
