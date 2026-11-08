import { Resend } from "resend";

let client: Resend | null = null;

/** Lazily constructed, cached across calls within the same server process —
 *  same reasoning as the Supabase admin client and the Stripe client. */
function getResendClient(): Resend {
  if (client) {
    return client;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing RESEND_API_KEY. Add it to .env.local — find/create it in the Resend dashboard " +
        "under API Keys."
    );
  }
  client = new Resend(apiKey);
  return client;
}

const FROM_ADDRESS = "Booktight <billing@mail.booktight.co.uk>";
const REPLY_TO = "support@booktight.co.uk";

export type DeletionWarningMilestone = "lapsed" | "day_30" | "day_60" | "day_80" | "day_89";

/**
 * Every link in these emails is built from this one function, never a
 * hardcoded domain. In production specifically, it refuses to build a link
 * at all — rather than silently mailing someone a dead or unsafe one — if
 * NEXT_PUBLIC_APP_URL is unset or still points at localhost; outside
 * production (dev, test scripts), whatever .env.local has is used as-is,
 * since http://localhost:3000 there is correct, not a mistake. Exported
 * only so scripts/test-email-links.mjs can exercise this guard directly,
 * with no network call and no real send either way.
 */
export function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NODE_ENV === "production") {
    if (!base) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is not set in production — refusing to build an email link."
      );
    }
    if (base.includes("localhost")) {
      throw new Error(
        `NEXT_PUBLIC_APP_URL is "${base}" in production — refusing to build an email link to localhost.`
      );
    }
  }
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_APP_URL.");
  }
  return `${base}${path}`;
}

function formatDeletionDate(date: Date): string {
  // "6 February 2027" — Europe/London since that's this app's only
  // audience (see src/lib/terms.ts), not the server's own timezone.
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(date);
}

function daysLeftPhrase(daysLeft: number): string {
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "1 day";
  return `${daysLeft} days`;
}

function wrapHtml(bodyHtml: string): string {
  return (
    `<!doctype html><html><body style="font-family: -apple-system, Helvetica, Arial, sans-serif; ` +
    `color: #1b1f24; line-height: 1.6; max-width: 480px;">${bodyHtml}</body></html>`
  );
}

interface EmailCopy {
  subject: string;
  text: string;
  html: string;
}

/** Plain, short, transactional copy — not marketing — matching what the
 *  Terms and Privacy Policy already promise ("90 days", "we will warn
 *  you"). daysLeft is always 90 minus however many days have actually
 *  passed, not the milestone's own nominal day count, so the number in the
 *  email is never wrong even if a run was delayed; deletionDate is the
 *  actual calendar date that same math points at (lapsed_at + 90 days),
 *  shown from day_30 on alongside it — "lapsed" only states the one-time
 *  "90 days from now" framing, since there's nothing to count down from
 *  yet. */
function emailCopyFor(milestone: DeletionWarningMilestone, daysLeft: number, deletionDate: Date): EmailCopy {
  const exportLink = appUrl("/account#export");
  const billingLink = appUrl("/billing");
  const deletionDateText = formatDeletionDate(deletionDate);

  const linksText = `Export your data: ${exportLink}\nResubscribe: ${billingLink}\n\n— Booktight\nsupport@booktight.co.uk`;
  const linksHtml =
    `<p><a href="${exportLink}">Export your data</a><br>` +
    `<a href="${billingLink}">Resubscribe</a></p>` +
    `<p>— Booktight<br><a href="mailto:${REPLY_TO}">${REPLY_TO}</a></p>`;

  switch (milestone) {
    case "lapsed":
      return {
        subject: "Your Booktight account is now read-only",
        text:
          "Hi,\n\nYour Booktight trial or subscription has ended, so your account is now " +
          "read-only. You can still see your jobs, export your data, or resubscribe at any time.\n\n" +
          `If nothing changes, we'll delete your account and data on ${deletionDateText} (90 days ` +
          "from now) — we'll send a few reminders before then.\n\n" +
          linksText,
        html: wrapHtml(
          "<p>Hi,</p>" +
            "<p>Your Booktight trial or subscription has ended, so your account is now read-only. " +
            "You can still see your jobs, export your data, or resubscribe at any time.</p>" +
            `<p>If nothing changes, we'll delete your account and data on <strong>${deletionDateText}</strong> ` +
            "(90 days from now) — we'll send a few reminders before then.</p>" +
            linksHtml
        ),
      };
    case "day_89":
      return {
        subject: "Last chance: your Booktight account is deleted tomorrow",
        text:
          `Hi,\n\nThis is the last reminder: tomorrow, ${deletionDateText}, we'll permanently delete ` +
          "your Booktight account and all its data, unless you resubscribe before then.\n\n" +
          "If you want to keep a copy of anything, export it now — once your account is deleted, " +
          "this can't be undone.\n\n" +
          linksText,
        html: wrapHtml(
          "<p>Hi,</p>" +
            `<p>This is the last reminder: tomorrow, <strong>${deletionDateText}</strong>, we'll ` +
            "permanently delete your Booktight account and all its data, unless you resubscribe " +
            "before then.</p>" +
            "<p>If you want to keep a copy of anything, export it now — once your account is deleted, " +
            "this can't be undone.</p>" +
            linksHtml
        ),
      };
    default: {
      // day_30 / day_60 / day_80
      const left = daysLeftPhrase(daysLeft);
      return {
        subject: `${left} left before your Booktight data is deleted`,
        text:
          "Hi,\n\nJust a reminder: your Booktight account has been read-only for a while, and " +
          `${left} from now (${deletionDateText}) we'll delete your account and all its data, ` +
          "unless you resubscribe before then.\n\n" +
          linksText,
        html: wrapHtml(
          "<p>Hi,</p>" +
            "<p>Just a reminder: your Booktight account has been read-only for a while, and " +
            `${left} from now (<strong>${deletionDateText}</strong>) we'll delete your account and ` +
            "all its data, unless you resubscribe before then.</p>" +
            linksHtml
        ),
      };
    }
  }
}

export async function sendDeletionWarningEmail(
  to: string,
  milestone: DeletionWarningMilestone,
  context: { daysLeft: number; deletionDate: Date }
): Promise<void> {
  const { subject, text, html } = emailCopyFor(milestone, context.daysLeft, context.deletionDate);
  const { error } = await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to,
    replyTo: REPLY_TO,
    subject,
    text,
    html,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
