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

export type DeletionWarningMilestone = "lapsed" | "day_30" | "day_60" | "day_80" | "day_89";

function appUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}

/** Plain, short, transactional copy — not marketing — matching what the
 *  Terms and Privacy Policy already promise ("90 days", "we will warn
 *  you"). daysLeft is always 90 minus however many days have actually
 *  passed, not the milestone's own nominal day count, so the number in the
 *  email is never wrong even if a run was delayed. */
function emailCopyFor(
  milestone: DeletionWarningMilestone,
  daysLeft: number
): { subject: string; text: string } {
  const exportLink = appUrl("/account");
  const billingLink = appUrl("/billing");
  const footer =
    `\n\nExport your data: ${exportLink}\nResubscribe: ${billingLink}\n\n— Booktight\n` +
    `support@booktight.co.uk`;

  switch (milestone) {
    case "lapsed":
      return {
        subject: "Your Booktight account is now read-only",
        text:
          "Hi,\n\nYour Booktight trial or subscription has ended, so your account is now " +
          "read-only. You can still see your jobs, export your data, or resubscribe at any time.\n\n" +
          "If nothing changes, we'll delete your account and data in 90 days — we'll send a " +
          "few reminders before then." +
          footer,
      };
    case "day_89":
      return {
        subject: "Last chance: your Booktight account is deleted tomorrow",
        text:
          "Hi,\n\nThis is the last reminder: tomorrow we'll permanently delete your Booktight " +
          "account and all its data, unless you resubscribe before then.\n\n" +
          "If you want to keep a copy of anything, export it now — once your account is " +
          "deleted, this can't be undone." +
          footer,
      };
    default: {
      // day_30 / day_60 / day_80
      return {
        subject: `${daysLeft} days left before your Booktight data is deleted`,
        text:
          `Hi,\n\nJust a reminder: your Booktight account has been read-only for a while, and ` +
          `${daysLeft} days from now we'll delete your account and all its data, unless you ` +
          "resubscribe before then." +
          footer,
      };
    }
  }
}

export async function sendDeletionWarningEmail(
  to: string,
  milestone: DeletionWarningMilestone,
  context: { daysLeft: number }
): Promise<void> {
  const { subject, text } = emailCopyFor(milestone, context.daysLeft);
  const { error } = await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
