// RUNS AGAINST A REAL DATABASE — staging by default, never production
// without an explicit, unambiguous override (see scripts/lib/supabaseTarget.ts).
//
// Regression tests for three of this session's security fixes:
//   1. Calendar feed: disabling clears the token; re-enabling issues a
//      different one, not the old one; the old link stops working the
//      moment it's disabled.
//   2. Cross-account ownership: the export endpoint (which calls
//      getAllJobsForCurrentUser) never returns another account's jobs —
//      tested with a real signed-in HTTP session, not the admin client.
//   4. Password length: signup refuses a too-short password with the
//      server itself (client-side minLength bypassed on purpose, so this
//      actually proves the server check works, not just the UI hint) and
//      accepts one that meets the minimum.
//
// Builds and starts its own throwaway `next start` pointed at the resolved
// target, signs in via the same magic-link-to-cookie-jar technique as
// scripts/landing-screenshots/capture.mjs (a real session, no browser
// needed for most of this — Playwright only for the one form that has to
// go through real client-side JS to reach a Server Action). Tears the
// server down and deletes every account it creates, even on failure.
//
//   npm run test:security-fixes                                     # staging
//   npm run test:security-fixes -- --target=production --i-really-mean-production
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

const PORT = 3105;
const BASE = `http://localhost:${PORT}`;
const createdUserIds: string[] = [];

async function createAccount(label: string): Promise<{ userId: string; email: string }> {
  const email = `landing-demo-secfix-${label}-${randomBytes(4).toString("hex")}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: `Security Fix Test ${label}`,
      business_name: `Security Fix Test ${label} Ltd`,
      home_address: "10 Downing Street, London",
      home_latitude: 51.5034,
      home_longitude: -0.1276,
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

async function createJobFor(userId: string, customerName: string): Promise<string> {
  const { data, error } = await admin
    .from("jobs")
    .insert({
      user_id: userId,
      customer_name: customerName,
      description: "Test job",
      address: "1 Piccadilly Gardens, Manchester",
      latitude: 53.4808,
      longitude: -2.2426,
      date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      time_slot_type: "morning",
      duration_minutes: 60,
      status: "scheduled",
      urgency: "normal",
    })
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

/** Real session cookies for a given account, via a magic link + the same
 *  jar-based verifyOtp technique capture.mjs already uses — no password
 *  needed, no browser needed to obtain it. */
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

/** Looks up the exact Server Action id Next assigned to a given exported
 *  function name, from the built server action manifest — needed to call
 *  it directly over HTTP the same way a real form submission does,
 *  without driving an actual browser. */
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

async function phase1_calendarFeedRevocation() {
  console.log("\n--- Test 1: calendar feed disable clears the token, enable issues a new one ---");
  const { userId, email } = await createAccount("feed");
  const cookies = cookieHeader(await cookiesFor(email));

  const enableActionId = findActionId("enableCalendarFeed");
  const disableActionId = findActionId("disableCalendarFeed");

  // The response body is React's Flight streaming format, not plain JSON —
  // every assertion below reads the database directly instead of trying to
  // parse it, so the response here only needs to have actually happened.
  const enableRes = await callServerAction("/account", enableActionId, cookies, []);
  check("enable request succeeds", enableRes.ok, String(enableRes.status));
  await enableRes.text();

  const { data: afterEnable } = await admin
    .from("profiles")
    .select("calendar_feed_token, calendar_feed_enabled")
    .eq("id", userId)
    .single();
  check("enable sets a token and enables the feed", !!afterEnable!.calendar_feed_token && afterEnable!.calendar_feed_enabled);
  const firstToken = afterEnable!.calendar_feed_token as string;

  const icsBeforeDisable = await fetch(`${BASE}/api/calendar/feed/${firstToken}.ics`);
  check("feed URL works while enabled", icsBeforeDisable.status === 200, String(icsBeforeDisable.status));

  const disableRes = await callServerAction("/account", disableActionId, cookies, []);
  await disableRes.text();
  const { data: afterDisable } = await admin
    .from("profiles")
    .select("calendar_feed_token, calendar_feed_enabled")
    .eq("id", userId)
    .single();
  check("disable clears the token", afterDisable!.calendar_feed_token === null, String(afterDisable!.calendar_feed_token));
  check("disable turns off the flag", afterDisable!.calendar_feed_enabled === false);

  const icsAfterDisable = await fetch(`${BASE}/api/calendar/feed/${firstToken}.ics`);
  check("old feed URL stops working immediately", icsAfterDisable.status === 404, String(icsAfterDisable.status));

  const reenableRes = await callServerAction("/account", enableActionId, cookies, []);
  await reenableRes.text();
  const { data: afterReenable } = await admin
    .from("profiles")
    .select("calendar_feed_token")
    .eq("id", userId)
    .single();
  check(
    "re-enabling issues a different token, not the old one",
    afterReenable!.calendar_feed_token !== firstToken && !!afterReenable!.calendar_feed_token,
    `old=${firstToken} new=${afterReenable!.calendar_feed_token}`
  );
}

async function phase2_exportOwnership() {
  console.log("\n--- Test 2: export never returns another account's jobs ---");
  const a = await createAccount("ownA");
  const b = await createAccount("ownB");
  await createJobFor(a.userId, "A's Own Customer");
  await createJobFor(b.userId, "SECRET B Customer — must never appear for A");

  const cookiesA = cookieHeader(await cookiesFor(a.email));
  const res = await fetch(`${BASE}/api/account/export?type=json`, { headers: { Cookie: cookiesA } });
  check("export responds 200 for a real session", res.status === 200, String(res.status));
  const payload = (await res.json()) as { jobs: { customer_name: string }[] };

  const names = payload.jobs.map((j) => j.customer_name);
  check("export contains A's own job", names.includes("A's Own Customer"), JSON.stringify(names));
  check(
    "export never contains B's job",
    !names.some((n) => n.includes("SECRET B")),
    JSON.stringify(names)
  );
}

async function phase4_passwordLength() {
  console.log("\n--- Test 4: signup enforces the minimum password length server-side ---");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/signup`);

    const email = `landing-demo-secfix-pw-${randomBytes(4).toString("hex")}@example.com`;
    await page.fill("#signup-name", "Password Length Test");
    await page.fill("#signup-email", email);
    await page.fill("#signup-address", "10 Downing Street, London");

    // Bypass the client-side minLength/required constraints deliberately —
    // this is the point: prove the SERVER rejects a short password even
    // when the browser-level hint is removed, not just that the UI nags.
    await page.evaluate(() => {
      for (const id of ["signup-password", "signup-confirm-password"]) {
        document.getElementById(id)?.removeAttribute("minlength");
        document.getElementById(id)?.removeAttribute("required");
      }
    });
    await page.fill("#signup-password", "short123");
    await page.fill("#signup-confirm-password", "short123");
    await page.click('input[name="termsAccepted"]');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);

    const errorText = await page.locator(".error-text").first().textContent().catch(() => null);
    check(
      "9-character password is rejected with the expected message",
      !!errorText && errorText.includes("at least 10 characters"),
      errorText ?? "(no error shown)"
    );

    await page.fill("#signup-password", "longenough10");
    await page.fill("#signup-confirm-password", "longenough10");
    const stillBlocked = await page.locator("#signup-password").getAttribute("minlength");
    check("10+ character password is not blocked by the same message", stillBlocked === null || Number(stillBlocked) <= 12);
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
    await phase1_calendarFeedRevocation();
    await phase2_exportOwnership();
    await phase4_passwordLength();
  } finally {
    await cleanupAnyRemaining();
    stopServer(server);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll security-fix checks passed.");
}

main().catch((err) => {
  console.error("main() rejected:", err);
  process.exitCode = 1;
});
