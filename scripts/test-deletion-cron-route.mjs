// THROWAWAY — proves three things about GET /api/cron/deletion-warnings
// at the real HTTP level, against the live, shared database:
//   1. With PAYWALL_ENABLED unset, the route touches nothing (verified by
//      snapshotting subscriptions + deletion_warning_log row counts
//      before and after) and returns skippedReason: "paywall-disabled".
//   2. A missing or wrong CRON_SECRET gets 401, before anything else runs.
//   3. With PAYWALL_ENABLED on, ?dryRun=true touches nothing either —
//      verified the same way, against the real (non-empty) table.
//
// LIVE-DATABASE SAFETY: this script never issues a real (non-dry-run) run
// against the unscoped table — there is no way to pass onlyUserIds over
// HTTP, so the one scenario that needs real writes (PAYWALL on,
// DELETION_ENABLED off, emails actually send) is proven instead by
// scripts/test-deletion-cron.ts, which calls runDeletionWarningsJob()
// directly with onlyUserIds scoped to its own throwaway accounts. Every
// request this script makes is either paywall-off (zero DB calls by
// design) or dryRun=true (zero writes by design); every claim is checked
// against a real before/after snapshot, not just the response body.
//
// Run with: npm run test:deletion-cron-route
import { createClient } from "@supabase/supabase-js";
import { spawn, execSync } from "node:child_process";
import path from "node:path";

const PORT = 3101;
const BASE = `http://localhost:${PORT}`;
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) {
  console.error("Missing CRON_SECRET in .env.local.");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

let failures = 0;
function check(label, pass, detail) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!pass) failures++;
}

async function snapshot() {
  const { data: subs, error: e1 } = await admin
    .from("subscriptions")
    .select("user_id, lapsed_at, updated_at")
    .order("user_id");
  if (e1) throw e1;
  const { count: warnCount, error: e2 } = await admin
    .from("deletion_warning_log")
    .select("*", { count: "exact", head: true });
  if (e2) throw e2;
  const { count: delCount, error: e3 } = await admin
    .from("account_deletion_log")
    .select("*", { count: "exact", head: true });
  if (e3) throw e3;
  return { subs, warnCount, delCount };
}

function snapshotsEqual(a, b) {
  return (
    a.warnCount === b.warnCount &&
    a.delCount === b.delCount &&
    JSON.stringify(a.subs) === JSON.stringify(b.subs)
  );
}

function startServer(extraEnv) {
  const nextBin = path.join(process.cwd(), "node_modules/next/dist/bin/next");
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
  return server;
}

function stopServer(server) {
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

async function hit(path, headers) {
  const res = await fetch(`${BASE}${path}`, { headers });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body };
}

async function main() {
  // ---- Part 1: PAYWALL_ENABLED unset (whatever .env.local actually has — confirmed unset).
  console.log("\n--- Server A: PAYWALL_ENABLED unset ---");
  let server = startServer({});
  try {
    await waitForServer();
    const before = await snapshot();

    const ok = await hit("/api/cron/deletion-warnings", { Authorization: `Bearer ${CRON_SECRET}` });
    check("valid secret, paywall off: HTTP 200", ok.status === 200, String(ok.status));
    check(
      "valid secret, paywall off: skippedReason is paywall-disabled",
      ok.body?.skippedReason === "paywall-disabled",
      JSON.stringify(ok.body)
    );
    check(
      "valid secret, paywall off: every count is zero",
      ok.body &&
        ok.body.checked === 0 &&
        ok.body.newlyLapsed === 0 &&
        ok.body.deletionsSucceeded === 0,
      JSON.stringify(ok.body)
    );

    const noAuth = await hit("/api/cron/deletion-warnings", {});
    check("missing Authorization header: HTTP 401", noAuth.status === 401, String(noAuth.status));

    const wrongAuth = await hit("/api/cron/deletion-warnings", { Authorization: "Bearer not-the-secret" });
    check("wrong secret: HTTP 401", wrongAuth.status === 401, String(wrongAuth.status));

    const after = await snapshot();
    check(
      "database completely unchanged after all three requests",
      snapshotsEqual(before, after),
      `before: ${JSON.stringify(before)} / after: ${JSON.stringify(after)}`
    );
  } finally {
    stopServer(server);
    await new Promise((r) => setTimeout(r, 1000));
  }

  // ---- Part 2: PAYWALL_ENABLED on, but every request here is ?dryRun=true.
  console.log("\n--- Server B: PAYWALL_ENABLED on, dryRun=true only ---");
  server = startServer({
    PAYWALL_ENABLED: "true",
    PAYWALL_LIVE_FROM: new Date(Date.now() - 365 * 86_400_000).toISOString(),
  });
  try {
    await waitForServer();
    const before = await snapshot();

    const dry = await hit("/api/cron/deletion-warnings?dryRun=true", {
      Authorization: `Bearer ${CRON_SECRET}`,
    });
    check("dryRun: HTTP 200", dry.status === 200, String(dry.status));
    check("dryRun: skippedReason is null (paywall is on)", dry.body?.skippedReason === null, JSON.stringify(dry.body));
    check(
      "dryRun: actually scanned the real table (checked > 0)",
      typeof dry.body?.checked === "number" && dry.body.checked > 0,
      JSON.stringify(dry.body)
    );

    const after = await snapshot();
    check(
      "database completely unchanged after the dry run",
      snapshotsEqual(before, after),
      `before: ${JSON.stringify(before)} / after: ${JSON.stringify(after)}`
    );
  } finally {
    stopServer(server);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll cron-route checks passed.");
}

main().catch((err) => {
  console.error("main() rejected:", err);
  process.exitCode = 1;
});
