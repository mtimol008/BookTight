// Captures the two landing-page screenshots from the production build, signed
// in as the demo account, then exports them to WebP. Run after
// `npm run build` and `npm run screenshots:seed`:
//   npm run screenshots:capture
// Output: 1170×2532 PNGs in scripts/landing-screenshots/out/, and
// public/landing/screenshot-{week,add}-{1170,780}.webp.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEMO_NEW_JOB } from "./demo-data.mjs";
import { DIR, OUT_DIR, STATE_FILE } from "./shared.mjs";
import { exportWebp } from "./export.mjs";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

if (!existsSync(STATE_FILE)) {
  console.error("No demo account yet. Run `npm run screenshots:seed` first.");
  process.exit(1);
}
if (!existsSync(path.join(DIR, "../../.next/BUILD_ID"))) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}
const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
mkdirSync(OUT_DIR, { recursive: true });

// Monday of the demo week, before the first job (06:45 UTC = 06:45/07:45 London).
const FAKE_NOW = `${state.monday}T06:45:00Z`;

// ---- 1. A session for the demo account, as cookies (magic-link token, no password).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: state.email });
if (linkError) throw linkError;

const jar = new Map();
const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
  },
});
const { error: otpError } = await ssr.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (otpError) throw otpError;

// ---- 2. The production server, with its clock on the demo Monday.
// Forward slashes: NODE_OPTIONS treats backslashes as escapes on Windows.
const fakeClock = path.join(DIR, "fake-clock.cjs").replace(/\\/g, "/");
const nextBin = path.join(DIR, "../../node_modules/next/dist/bin/next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
  cwd: path.join(DIR, "../.."),
  env: {
    ...process.env,
    FAKE_NOW,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require "${fakeClock}"`.trim(),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => process.stderr.write(d));
const stopServer = () => {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    else server.kill("SIGTERM");
  } catch {}
};

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

// Scrollbars and anything toast-like are hidden; animations are settled.
const CLEAN_CSS = `
  html, body, * { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  [data-sonner-toaster], [role="status"][aria-live], .toast, nextjs-portal { display: none !important; }
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; }
`;

async function settle(page) {
  await page.addStyleTag({ content: CLEAN_CSS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
}

async function shoot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled", caret: "hide", scale: "device" });
  console.log(`Captured ${name}.png`);
  return file;
}

let browser;
try {
  await waitForServer();

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Europe/London",
    colorScheme: "light",
  });
  await context.clock.install({ time: new Date(FAKE_NOW) });
  await context.addCookies(
    [...jar.entries()].map(([name, value]) => ({ name, value, domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax" })),
  );
  const page = await context.newPage();

  // ---- 3. Week view.
  await page.goto(`${BASE}/`);
  if (new URL(page.url()).pathname !== "/") throw new Error(`Expected the week view, landed on ${page.url()}`);
  await page.locator(".day-title").first().waitFor();
  await settle(page);
  await shoot(page, "screenshot-week");

  // ---- 4. Add a job → suggested day.
  await page.goto(`${BASE}/add`);
  await page.locator("#job-address").fill(DEMO_NEW_JOB.address);
  await page.locator("#job-address").blur();
  await page.locator("#job-customer").fill(DEMO_NEW_JOB.customer_name);
  await page.locator("#job-description").fill(DEMO_NEW_JOB.description);
  await page.getByLabel("Hours").fill(DEMO_NEW_JOB.hours);
  await page.getByLabel("Minutes").fill(DEMO_NEW_JOB.minutes);
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Find the best day" }).click();
  await page.locator(".suggest-headline").first().waitFor({ timeout: 20000 });
  await settle(page);
  // Start the frame on a whole block, never a half-cut line: the duration
  // help text just above "Time" (the page can't scroll far enough to start
  // at "Time" itself), falling back to the "Time" label.
  await page.evaluate(() => {
    const leaf = [...document.querySelectorAll("p, div, span")].find(
      (el) => el.children.length === 0 && el.textContent.includes("longer ones nearby"),
    );
    const label = [...document.querySelectorAll(".field-label")].find((el) => el.textContent.trim() === "Time");
    const anchor = leaf ?? label ?? document.querySelector(".suggest");
    window.scrollTo(0, anchor.getBoundingClientRect().top + window.scrollY - 24);
  });
  const top = await page.evaluate(() => window.scrollY);
  console.log(`  add screen scrolled to ${top}px`);
  await page.waitForTimeout(300);
  await shoot(page, "screenshot-add");

  await browser.close();
  browser = undefined;
} finally {
  if (browser) await browser.close();
  stopServer();
}

await exportWebp();
console.log("Done. Check the images, then run: npm run screenshots:cleanup");
