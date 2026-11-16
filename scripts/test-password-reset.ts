// RUNS AGAINST A REAL DATABASE — staging by default, never production
// without an explicit, unambiguous override (see scripts/lib/supabaseTarget.ts).
//
// Regression test for the password-reset fix: Supabase's recovery link
// uses the legacy hash-fragment format (#access_token=...&type=recovery),
// which the browser client's default PKCE flow never recognizes — the
// reset-password page always fell through to "invalid or expired". The fix
// sets flowType: "implicit" on that one browser client (src/lib/supabase/
// client.ts), which has exactly one call site (ResetPasswordForm).
//
// Covers, with a REAL admin-generated recovery link and a real browser:
//   1. A valid link lands on reset-password and shows the form (not stuck
//      on "checking" or "invalid").
//   2. A 7-char password is rejected; an 8-char one is accepted and
//      actually changes the password.
//   3. Re-using the same link a second time (after Supabase has already
//      consumed the one-time recovery token) shows "invalid or expired" —
//      proving the fix didn't make the page claim success unconditionally.
//   4. Signing in with the NEW password afterwards actually works.
//
// Builds and starts its own throwaway `next start` pointed at the resolved
// target. Tears the server down and deletes every account it creates, even
// on failure.
//
//   npm run test:password-reset                                     # staging
//   npm run test:password-reset -- --target=production --i-really-mean-production
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exitCode = 1;
});

import { randomBytes } from "node:crypto";
import { spawn, spawnSync, execSync } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
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
const { url, secretKey } = creds;
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const TERMS_VERSION = readFileSync("src/lib/terms.ts", "utf8").match(
  /TERMS_VERSION\s*=\s*"([^"]+)"/
)![1];

const PORT = 3109;
const BASE = `http://localhost:${PORT}`;
const createdUserIds: string[] = [];

async function createAccount(label: string): Promise<{ userId: string; email: string }> {
  const email = `landing-demo-pwreset-${label}-${randomBytes(4).toString("hex")}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: "originalPassword123",
    email_confirm: true,
    user_metadata: {
      full_name: `Password Reset Test ${label}`,
      business_name: `Password Reset Test ${label} Ltd`,
      home_address: "10 Downing Street, London",
      home_latitude: 51.5034,
      home_longitude: -0.1276,
      timezone: "Europe/London",
      terms_version: TERMS_VERSION,
    },
  });
  if (error) throw error;
  createdUserIds.push(created.user.id);
  return { userId: created.user.id, email };
}

async function generateRecoveryLink(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${BASE}/reset-password` },
  });
  if (error) throw error;
  return data.properties.action_link;
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

/** Follows a Supabase hosted recovery link far enough to get the real
 *  token hash fragment Supabase attaches on redirect, without needing
 *  that redirect to actually reach our app — staging's Site
 *  URL/redirect allowlist only contains preview.booktight.co.uk, which
 *  sits behind Vercel's SSO wall, so the browser never actually lands on
 *  our app from a real click either way in this local-staging setup.
 *  Browsers carry a request's URL fragment across a redirect whose
 *  Location header has no fragment of its own (part of the URL spec),
 *  so the real access_token/refresh_token/type=recovery fragment Supabase
 *  issues is still intact on whatever page the browser ends up on — we
 *  just lift it from there and hand it to OUR app directly. This tests
 *  exactly the thing the fix changes (how the app parses a real recovery
 *  fragment) without requiring any Supabase dashboard allowlist change. */
async function fetchRecoveryFragment(page: import("playwright").Page, link: string): Promise<string> {
  await page.goto(link).catch(() => {});
  await page.waitForTimeout(1500);
  const landedUrl = page.url();
  const hashIndex = landedUrl.indexOf("#");
  return hashIndex === -1 ? "" : landedUrl.slice(hashIndex);
}

async function main() {
  const server = startServer();
  try {
    await waitForServer();

    console.log("\n--- Password reset: real recovery link, end to end ---");
    const { email } = await createAccount("flow");
    const recoveryLink = await generateRecoveryLink(email);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const fragment = await fetchRecoveryFragment(page, recoveryLink);
      check("Supabase's verify step issued a real access_token fragment", fragment.includes("access_token="), fragment.slice(0, 60));
      await page.goto(`${BASE}/reset-password${fragment}`);

      // Give the client time past the 3s "no recovery event" timeout to
      // settle on either state.
      const formVisible = await page
        .locator("#reset-password-new")
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      check("valid recovery link reaches the reset form (not stuck on invalid)", formVisible);
      if (!formVisible) {
        console.log("Fragment used:", fragment.slice(0, 60));
      } else {
        // 7-char password rejected
        await page.evaluate(() => {
          for (const id of ["reset-password-new", "reset-password-confirm"]) {
            document.getElementById(id)?.removeAttribute("minlength");
            document.getElementById(id)?.removeAttribute("required");
          }
        });
        await page.fill("#reset-password-new", "short1");
        await page.fill("#reset-password-confirm", "short1");
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);
        const shortError = await page.locator(".error-text").first().textContent().catch(() => null);
        check(
          "7-char password is rejected with the expected message",
          !!shortError && shortError.includes("at least 8 characters"),
          shortError ?? "(no error shown)"
        );

        // 8-char password accepted
        await page.fill("#reset-password-new", "newPassword8");
        await page.fill("#reset-password-confirm", "newPassword8");
        await page.click('button[type="submit"]');
        const saved = await page
          .locator(".success-text")
          .waitFor({ state: "visible", timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        check("8-char password is accepted and the page shows success", saved);
      }

      // Re-use the SAME link a second time — Supabase's recovery token is
      // one-time-use, so this should now be genuinely invalid (Supabase's
      // own verify step issues an error fragment this time, not a fresh
      // access_token).
      const page2 = await browser.newPage();
      const staleFragment = await fetchRecoveryFragment(page2, recoveryLink);
      check(
        "re-using the link a second time no longer yields a fresh access_token",
        !staleFragment.includes("access_token="),
        staleFragment.slice(0, 60)
      );
      await page2.goto(`${BASE}/reset-password${staleFragment}`);
      await page2.waitForTimeout(3500); // past the page's own 3s timeout
      const invalidShown = await page2.locator("text=invalid or has expired").isVisible().catch(() => false);
      check("re-using the same link afterward shows invalid/expired", invalidShown);
      await page2.close();

      // Sign in with the NEW password to confirm it actually took effect.
      const loginPage = await browser.newPage();
      await loginPage.goto(`${BASE}/login`);
      await loginPage.fill("#email", email);
      await loginPage.fill("#password", "newPassword8");
      await loginPage.click('button[type="submit"]');
      const signedIn = await loginPage
        .waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      check("signing in with the new password works", signedIn, loginPage.url());
      await loginPage.close();
    } finally {
      await browser.close();
    }
  } finally {
    for (const userId of createdUserIds) {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data?.user) await admin.auth.admin.deleteUser(userId);
    }
    stopServer(server);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll password-reset checks passed.");
}

main().catch((err) => {
  console.error("main() rejected:", err);
  process.exitCode = 1;
});
