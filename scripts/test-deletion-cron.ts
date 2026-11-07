// THROWAWAY — exercises every milestone of the 90-day deletion-warning
// cron (src/lib/deletionWarnings.ts) against real throwaway accounts,
// without waiting 90 days or needing a live Resend key: a stub sendEmail is
// injected instead of the real one, so the whole state machine (lapsing,
// each warning milestone, the resubscribe-clears path, the cap, the
// day_89-plus-an-aged-earlier-warning deletion gate, and the actual
// delete) is verified for real against Supabase. Run with:
//   npm run test:deletion-cron
//
// Deletes every account it creates, even on failure.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exitCode = 1;
});

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAdminClient } from "../src/lib/supabase/admin";
import { runDeletionWarningsJob } from "../src/lib/deletionWarnings";
import type { DeletionWarningMilestone } from "../src/lib/email";

const admin = createAdminClient();
const TERMS_VERSION = readFileSync("src/lib/terms.ts", "utf8").match(
  /TERMS_VERSION\s*=\s*"([^"]+)"/
)![1];

const createdUserIds: string[] = [];
let failures = 0;

function check(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!pass) failures++;
}

interface SentEmail {
  to: string;
  milestone: DeletionWarningMilestone;
  daysLeft: number;
}

function makeStubSendEmail() {
  const sent: SentEmail[] = [];
  const fn = async (to: string, milestone: DeletionWarningMilestone, context: { daysLeft: number }) => {
    sent.push({ to, milestone, daysLeft: context.daysLeft });
  };
  return { fn, sent };
}

async function createAccount(): Promise<{ userId: string; email: string }> {
  const email = `landing-demo-${randomBytes(4).toString("hex")}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: "Deletion Test",
      business_name: "Deletion Test Ltd",
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

async function setTrialEndsAt(userId: string, date: Date) {
  const { error } = await admin
    .from("subscriptions")
    .update({ trial_ends_at: date.toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

async function setLapsedAt(userId: string, date: Date | null) {
  const { error } = await admin
    .from("subscriptions")
    .update({ lapsed_at: date?.toISOString() ?? null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

async function setCompedUntil(userId: string, date: Date | null) {
  const { error } = await admin
    .from("subscriptions")
    .update({ comped_until: date?.toISOString() ?? null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

async function insertWarningLog(userId: string, milestone: DeletionWarningMilestone, sentAt: Date) {
  const { error } = await admin
    .from("deletion_warning_log")
    .upsert({ user_id: userId, milestone, sent_at: sentAt.toISOString() });
  if (error) throw error;
}

async function warningLogRows(userId: string): Promise<{ milestone: string; sent_at: string }[]> {
  const { data, error } = await admin
    .from("deletion_warning_log")
    .select("milestone, sent_at")
    .eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}

async function subscriptionRow(userId: string) {
  const { data, error } = await admin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function userStillExists(userId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  return !error && !!data?.user;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

async function phaseA_fullLifecycle() {
  console.log("\n--- Phase A: one account through every milestone to deletion ---");
  const { userId, email } = await createAccount();

  // Just lapsed (a few minutes ago) — the job should set lapsed_at itself
  // from trial_ends_at, same as it would for a real expired trial.
  await setTrialEndsAt(userId, new Date(Date.now() - 60_000));
  let stub = makeStubSendEmail();
  let summary = await runDeletionWarningsJob({ sendEmail: stub.fn });
  const sub1 = await subscriptionRow(userId);
  check("lapsed_at set on first lapse", !!sub1?.lapsed_at);
  check(
    "'lapsed' milestone email sent",
    stub.sent.some((s) => s.to === email && s.milestone === "lapsed")
  );
  check("newlyLapsed counted", summary.newlyLapsed === 1, String(summary.newlyLapsed));

  // Jump the clock by backdating lapsed_at directly, one milestone at a
  // time — exactly what 30/60/80/89 real days would look like.
  for (const [days, milestone] of [
    [31, "day_30"],
    [61, "day_60"],
    [81, "day_80"],
  ] as const) {
    await setLapsedAt(userId, daysAgo(days));
    stub = makeStubSendEmail();
    await runDeletionWarningsJob({ sendEmail: stub.fn });
    check(`'${milestone}' milestone email sent at day ${days}`, stub.sent.some((s) => s.milestone === milestone));
  }

  // Day 91: day_89 becomes due and is sent this run. The earlier
  // milestones (lapsed at day 0, day_30 at day 31, day_60 at day 61,
  // day_80 at day 81) are already well past 7 days old by now, so the
  // warning-history gate (see phaseD below for its own dedicated test) is
  // already satisfied the moment day_89 goes out — only DELETION_ENABLED
  // stands between this account and being deleted.
  await setLapsedAt(userId, daysAgo(91));
  delete process.env.DELETION_ENABLED;
  stub = makeStubSendEmail();
  summary = await runDeletionWarningsJob({ sendEmail: stub.fn });
  check("'day_89' milestone email sent at day 91", stub.sent.some((s) => s.milestone === "day_89"));
  check(
    "deletion skipped — DELETION_ENABLED is off",
    summary.deletionsSkippedDisabled === 1 && summary.deletionsSucceeded === 0
  );
  check("account not deleted while DELETION_ENABLED is off", await userStillExists(userId));

  // Flip it on for this process only and run once more.
  process.env.DELETION_ENABLED = "true";
  stub = makeStubSendEmail();
  summary = await runDeletionWarningsJob({ sendEmail: stub.fn });
  check("deletion succeeded once enabled", summary.deletionsSucceeded === 1, JSON.stringify(summary));
  check("account actually gone", !(await userStillExists(userId)));

  const { data: log } = await admin
    .from("account_deletion_log")
    .select("*")
    .eq("user_id", userId)
    .eq("reason", "auto_90_day")
    .maybeSingle();
  check("account_deletion_log row written with reason auto_90_day", !!log);

  delete process.env.DELETION_ENABLED;
}

async function phaseB_resubscribeClears() {
  console.log("\n--- Phase B: resubscribing clears lapsed_at and the warning log ---");
  const { userId } = await createAccount();
  await setLapsedAt(userId, daysAgo(40));
  await insertWarningLog(userId, "lapsed", daysAgo(40));
  await insertWarningLog(userId, "day_30", daysAgo(10));

  await setCompedUntil(userId, new Date(Date.now() + 30 * 86_400_000));
  const stub = makeStubSendEmail();
  const summary = await runDeletionWarningsJob({ sendEmail: stub.fn });

  check("clearedResubscribed counted", summary.clearedResubscribed === 1, String(summary.clearedResubscribed));
  const sub = await subscriptionRow(userId);
  check("lapsed_at cleared back to null", sub?.lapsed_at === null);
  const rows = await warningLogRows(userId);
  check("warning log wiped for this user", rows.length === 0, JSON.stringify(rows));

  await admin.auth.admin.deleteUser(userId);
}

async function phaseC_capAtFivePerRun() {
  console.log("\n--- Phase C: caps deletions at 5 per run ---");
  const accounts: { userId: string; lapseDays: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const { userId } = await createAccount();
    const lapseDays = 97 + i; // staggered so sort order is deterministic
    await setLapsedAt(userId, daysAgo(lapseDays));
    await insertWarningLog(userId, "day_89", daysAgo(8));
    accounts.push({ userId, lapseDays });
  }

  process.env.DELETION_ENABLED = "true";
  const stub = makeStubSendEmail();
  const summary = await runDeletionWarningsJob({ sendEmail: stub.fn });
  delete process.env.DELETION_ENABLED;

  check("exactly 5 deleted", summary.deletionsSucceeded === 5, String(summary.deletionsSucceeded));
  check("exactly 1 capped", summary.deletionsSkippedCap === 1, String(summary.deletionsSkippedCap));

  // The newest lapse (smallest lapseDays, i.e. i=5 / 102 days — wait, sort
  // is oldest lapsed_at first, so the LARGEST lapseDays are oldest and get
  // deleted first; the smallest lapseDays (97, the most recently lapsed of
  // the six) is the one left over.
  const stillThere = [];
  for (const a of accounts) {
    if (await userStillExists(a.userId)) stillThere.push(a);
  }
  check(
    "the most-recently-lapsed account is the one left over",
    stillThere.length === 1 && stillThere[0].lapseDays === 97,
    JSON.stringify(stillThere)
  );

  for (const a of stillThere) {
    await admin.auth.admin.deleteUser(a.userId);
  }
}

async function phaseD_finalWarningGateNeedsAnAgedEarlierWarning() {
  console.log("\n--- Phase D: deletion needs day_89 AND an aged earlier warning, not day_89 alone ---");
  const { userId } = await createAccount();
  await setLapsedAt(userId, daysAgo(90));
  process.env.DELETION_ENABLED = "true";

  // Case 1: day_89 sent, but no earlier milestone was ever logged for
  // this account — must not delete, however old the lapse itself is.
  await insertWarningLog(userId, "day_89", daysAgo(1));
  let stub = makeStubSendEmail();
  let summary = await runDeletionWarningsJob({ sendEmail: stub.fn });
  check(
    "day_89 alone, no earlier warning: deletion skipped",
    summary.deletionsSkippedInsufficientWarningHistory === 1 && summary.deletionsSucceeded === 0,
    JSON.stringify(summary)
  );
  check("account still exists after day_89 alone", await userStillExists(userId));

  // Case 2: add one earlier milestone, aged 7+ days — now it deletes, on
  // day 90.
  await insertWarningLog(userId, "day_80", daysAgo(8));
  stub = makeStubSendEmail();
  summary = await runDeletionWarningsJob({ sendEmail: stub.fn });
  check(
    "day_89 plus an aged earlier warning: deletes on day 90",
    summary.deletionsSucceeded === 1,
    JSON.stringify(summary)
  );
  check("account gone after the earlier warning is added", !(await userStillExists(userId)));

  delete process.env.DELETION_ENABLED;
}

async function cleanupAnyRemaining() {
  for (const userId of createdUserIds) {
    if (await userStillExists(userId)) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
}

async function main() {
  try {
    await phaseA_fullLifecycle();
    await phaseB_resubscribeClears();
    await phaseC_capAtFivePerRun();
    await phaseD_finalWarningGateNeedsAnAgedEarlierWarning();
  } finally {
    await cleanupAnyRemaining();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll deletion-cron checks passed.");
}

main().catch((err) => {
  console.error("main() rejected:", err);
  process.exitCode = 1;
});
