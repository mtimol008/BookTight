import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "./supabase/admin";
import { hasActiveEntitlement, effectiveLapsedAt } from "./entitlement";
import { isPaywallEnabled } from "./paywallConfig";
import { isDeletionEnabled } from "./deletionConfig";
import { deleteAccountCore } from "./accountDeletion";
import { sendDeletionWarningEmail, type DeletionWarningMilestone } from "./email";
import type { SubscriptionRecord } from "./subscriptions";

const MILESTONES: ReadonlyArray<{ key: DeletionWarningMilestone; afterDays: number }> = [
  { key: "lapsed", afterDays: 0 },
  { key: "day_30", afterDays: 30 },
  { key: "day_60", afterDays: 60 },
  { key: "day_80", afterDays: 80 },
  { key: "day_89", afterDays: 89 },
];

const DELETE_AFTER_DAYS = 90;
/** However far behind schedule things get, an account is never deleted
 *  unless the final warning has had at least this long to actually reach
 *  someone — decoupled from the day-90 math itself, as a second,
 *  independent safety margin. */
const MIN_DAYS_SINCE_FINAL_WARNING = 7;
/** A hard ceiling on how many accounts one run will ever delete — a cheap
 *  backstop against a clock bug or a mass-cancellation event quietly
 *  wiping out far more accounts than anyone intended in a single run. */
const MAX_DELETIONS_PER_RUN = 5;

type SendEmailFn = typeof sendDeletionWarningEmail;

export interface DeletionWarningsRunSummary {
  checked: number;
  newlyLapsed: number;
  clearedResubscribed: number;
  warningsSent: Record<DeletionWarningMilestone, number>;
  deletionCandidates: number;
  deletionsSucceeded: number;
  deletionsSkippedCap: number;
  deletionsSkippedNoFinalWarning: number;
  deletionsSkippedReentitled: number;
  deletionsSkippedDisabled: number;
  errors: number;
}

function emptySummary(): DeletionWarningsRunSummary {
  return {
    checked: 0,
    newlyLapsed: 0,
    clearedResubscribed: 0,
    warningsSent: { lapsed: 0, day_30: 0, day_60: 0, day_80: 0, day_89: 0 },
    deletionCandidates: 0,
    deletionsSucceeded: 0,
    deletionsSkippedCap: 0,
    deletionsSkippedNoFinalWarning: 0,
    deletionsSkippedReentitled: 0,
    deletionsSkippedDisabled: 0,
    errors: 0,
  };
}

interface DeletionCandidate {
  sub: SubscriptionRecord;
  lapsedAt: Date;
}

/**
 * The daily deletion-warning run — called by GET /api/cron/deletion-warnings
 * and, directly, by scripts/test-deletion-cron.ts (which passes a stub
 * sendEmail so it can exercise every milestone without a real Resend key
 * or 90 days of waiting).
 *
 * Two passes over every subscriptions row: first, set/clear lapsed_at and
 * send whichever warning emails are newly due; second, delete whichever
 * accounts have been lapsed 90+ days — kept separate so every warning for
 * every user is attempted before any deletion happens, rather than one
 * user's deletion racing ahead of another's reminder in the same run.
 *
 * dryRun does every read and every decision, but skips every write
 * (no lapsed_at set/clear, no email sent, no warning claimed, no account
 * deleted) — for a manual sanity check against real data with zero side
 * effects.
 */
export async function runDeletionWarningsJob(
  opts: { dryRun?: boolean; sendEmail?: SendEmailFn } = {}
): Promise<DeletionWarningsRunSummary> {
  const dryRun = opts.dryRun ?? false;
  const sendEmail = opts.sendEmail ?? sendDeletionWarningEmail;

  // This combination must never run quietly: every lapse date computed
  // below would be wrong (see effectiveLapsedAt's own comment).
  if (isPaywallEnabled() && !process.env.PAYWALL_LIVE_FROM) {
    throw new Error("PAYWALL_ENABLED is true but PAYWALL_LIVE_FROM is not set.");
  }

  const admin = createAdminClient();
  const summary = emptySummary();

  const { data: subs, error: subsError } = await admin.from("subscriptions").select("*");
  if (subsError) {
    throw new Error(`Failed to fetch subscriptions: ${subsError.message}`);
  }

  const candidates: DeletionCandidate[] = [];

  for (const sub of subs ?? []) {
    summary.checked++;
    try {
      if (hasActiveEntitlement(sub)) {
        if (sub.lapsed_at) {
          // Resubscribed, comped, or an admin override — the clock stops,
          // and any warnings already sent no longer apply to a future
          // lapse.
          if (!dryRun) {
            await admin
              .from("subscriptions")
              .update({ lapsed_at: null, updated_at: new Date().toISOString() })
              .eq("user_id", sub.user_id);
            await admin.from("deletion_warning_log").delete().eq("user_id", sub.user_id);
          }
          summary.clearedResubscribed++;
        }
        continue;
      }

      const effectiveDate = effectiveLapsedAt(sub);
      if (!effectiveDate) {
        // Can't happen (hasActiveEntitlement was false above), but keeps
        // the types honest without a non-null assertion.
        continue;
      }

      let lapsedAt = sub.lapsed_at ? new Date(sub.lapsed_at) : null;
      if (!lapsedAt) {
        lapsedAt = effectiveDate;
        if (!dryRun) {
          const { error: setError } = await admin
            .from("subscriptions")
            .update({ lapsed_at: lapsedAt.toISOString(), updated_at: new Date().toISOString() })
            .eq("user_id", sub.user_id);
          if (setError) throw new Error(`Failed to set lapsed_at: ${setError.message}`);
        }
        summary.newlyLapsed++;
      }

      const daysSinceLapse = Math.floor((Date.now() - lapsedAt.getTime()) / 86_400_000);

      for (const milestone of MILESTONES) {
        if (daysSinceLapse < milestone.afterDays) continue;

        const { data: already } = await admin
          .from("deletion_warning_log")
          .select("user_id")
          .eq("user_id", sub.user_id)
          .eq("milestone", milestone.key)
          .maybeSingle();
        if (already) continue;

        if (dryRun) {
          summary.warningsSent[milestone.key]++;
          continue;
        }

        // Claims the milestone before sending — the unique constraint on
        // (user_id, milestone) means a second run can never double-send,
        // and a failed send below deletes this claim so tomorrow retries.
        const { error: claimError } = await admin
          .from("deletion_warning_log")
          .insert({ user_id: sub.user_id, milestone: milestone.key });
        if (claimError) continue;

        try {
          const { data: userData, error: userError } = await admin.auth.admin.getUserById(
            sub.user_id
          );
          const email = userData?.user?.email;
          if (userError || !email) {
            throw new Error(userError?.message ?? "No email on file for this account");
          }
          const daysLeft = Math.max(0, DELETE_AFTER_DAYS - daysSinceLapse);
          await sendEmail(email, milestone.key, { daysLeft });
          summary.warningsSent[milestone.key]++;
        } catch (err) {
          await admin
            .from("deletion_warning_log")
            .delete()
            .eq("user_id", sub.user_id)
            .eq("milestone", milestone.key);
          Sentry.captureException(err, {
            tags: { job: "deletion-warning-cron", stage: "send-email", milestone: milestone.key },
            extra: { userId: sub.user_id },
          });
          summary.errors++;
        }
      }

      if (daysSinceLapse >= DELETE_AFTER_DAYS) {
        candidates.push({ sub, lapsedAt });
        summary.deletionCandidates++;
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { job: "deletion-warning-cron", stage: "process-user" },
        extra: { userId: sub.user_id },
      });
      summary.errors++;
    }
  }

  let toDelete = candidates;
  if (toDelete.length > MAX_DELETIONS_PER_RUN) {
    Sentry.captureMessage(
      `deletion-warning-cron: ${toDelete.length} accounts eligible for deletion in one run, ` +
        `capping at ${MAX_DELETIONS_PER_RUN}`,
      "warning"
    );
    // Oldest lapse first, so a capped run still makes forward progress on
    // the longest-overdue accounts rather than an arbitrary subset.
    toDelete = [...toDelete].sort((a, b) => a.lapsedAt.getTime() - b.lapsedAt.getTime());
    summary.deletionsSkippedCap = toDelete.length - MAX_DELETIONS_PER_RUN;
    toDelete = toDelete.slice(0, MAX_DELETIONS_PER_RUN);
  }

  for (const { sub } of toDelete) {
    try {
      const { data: finalWarning } = await admin
        .from("deletion_warning_log")
        .select("sent_at")
        .eq("user_id", sub.user_id)
        .eq("milestone", "day_89")
        .maybeSingle();
      const finalWarningAge = finalWarning
        ? Date.now() - new Date(finalWarning.sent_at).getTime()
        : null;
      if (finalWarningAge === null || finalWarningAge < MIN_DAYS_SINCE_FINAL_WARNING * 86_400_000) {
        summary.deletionsSkippedNoFinalWarning++;
        continue;
      }

      if (!isDeletionEnabled()) {
        summary.deletionsSkippedDisabled++;
        continue;
      }
      if (dryRun) continue;

      // Re-checked immediately before deleting, against a fresh row — not
      // the one read at the top of this run — since a resubscribe or a
      // comp could have landed at any point since.
      const { data: freshSub } = await admin
        .from("subscriptions")
        .select("*")
        .eq("user_id", sub.user_id)
        .maybeSingle();
      if (!freshSub || hasActiveEntitlement(freshSub)) {
        summary.deletionsSkippedReentitled++;
        continue;
      }

      const { data: userData } = await admin.auth.admin.getUserById(sub.user_id);
      const email = userData?.user?.email ?? "unknown@booktight.co.uk";

      await deleteAccountCore(sub.user_id, email, "auto_90_day");
      summary.deletionsSucceeded++;
    } catch (err) {
      Sentry.captureException(err, {
        tags: { job: "deletion-warning-cron", stage: "delete" },
        extra: { userId: sub.user_id },
      });
      summary.errors++;
    }
  }

  return summary;
}
