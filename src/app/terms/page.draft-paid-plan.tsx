// DRAFT — NOT LIVE. Named page.draft-paid-plan.tsx on purpose: Next's App
// Router only ever turns an exact "page.tsx" into a real route, so this
// file sits right next to the live one with zero chance of accidentally
// becoming reachable. It is the actual future /terms content, ready to
// ship — not a summary to rewrite later.
//
// TO SHIP, AT PAYWALL SWITCH-ON:
//   1. Update TERMS_VERSION in src/lib/terms.ts to the date below (or
//      today's real date, if this ships later than planned) — e.g.
//      "paid-2026-11-08". Bumping it is what makes the app ask every
//      existing account to re-accept these terms (src/app/accept-terms) —
//      don't do this before you're actually ready for that to start.
//   2. Update the "Last updated" line a few lines down to match.
//   3. Delete src/app/terms/page.tsx and rename this file to page.tsx.
//   4. Re-read it once more for anything that drifted since this was
//      written (pricing, the 14-day refund window, the calendar feed's
//      30-day grace, the 90-day retention) — these are the actual live
//      numbers as of 8 November 2026, confirmed against the current code
//      (CALENDAR_FEED_GRACE_DAYS in the feed route, the deletion-warning
//      cron's DELETE_AFTER_DAYS, the landing page's pricing section) —
//      not invented, but still worth one more check before this goes live
//      for real money.
import type { Metadata } from "next";
import { Footer } from "@/components/Footer";

// Before editing any claim below about backups, uptime, or a hosting
// region: re-check it against what the ACTUAL plan tier in use that day
// (Supabase, Vercel — both free/Hobby as of this writing) can really
// deliver. See src/app/privacy/page.tsx's own version of this note for
// the specific reason (Supabase's free tier has no automatic backups).
export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Booktight.",
};

// UPDATE at ship time (see the file-top comment).
const DRAFT_TERMS_VERSION = "paid-2026-11-08";
const DRAFT_LAST_UPDATED = "8 November 2026";

export default function TermsPage() {
  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 className="screen-title" style={{ marginBottom: 10 }}>Terms of Service</h1>
        <p className="legal-meta">
          Last updated: {DRAFT_LAST_UPDATED} &middot; Version: {DRAFT_TERMS_VERSION}
        </p>

        <div className="legal-doc">
          <h2>1. About these terms</h2>
          <p>
            These terms are between you and BookTight, a sole-trader business whose details are
            at the bottom of these terms. By creating an account you agree to them and to our
            Privacy Policy. If you do not agree, please do not use BookTight.
          </p>

          <h2>2. Who can use BookTight</h2>
          <p>BookTight is for people aged 18 or over who use it for their trade or business.</p>

          <h2>3. What BookTight does</h2>
          <p>
            BookTight suggests days and times for new jobs to reduce your driving. The
            suggestions are advice only. Distances and travel estimates are approximate and
            addresses may be located inaccurately. You are responsible for checking a suggestion
            before you rely on it and for the jobs you accept.
          </p>

          <h2>4. Your account</h2>
          <p>
            Give us accurate information, keep your password secure, and do not share your
            account. Tell us promptly if you think someone else has accessed it.
          </p>

          <h2>5. Acceptable use</h2>
          <p>You must not:</p>
          <ul>
            <li>use BookTight unlawfully;</li>
            <li>scrape it, or use bots or automated tools to access it;</li>
            <li>get around its limits or its bot protection;</li>
            <li>interfere with how it works or try to access anyone else&apos;s data;</li>
            <li>enter data you have no right to use.</li>
          </ul>

          <h2>6. Your data</h2>
          <p>
            You keep ownership of the data you enter. You give us permission to process it to
            provide BookTight, as described in our Privacy Policy. You are responsible for having
            a lawful reason to hold your customers&apos; data and for telling them how you use
            it. You can export your data at any time from Account.
          </p>

          <h2>7. Pricing</h2>
          <p>
            BookTight costs &pound;9.99 a month, or &pound;109 a year (a saving over paying
            monthly). Prices include everything &mdash; there is no separate tier or add-on. If we
            ever change the price, we will tell you in advance and give you the choice to continue
            at the new price or cancel first.
          </p>

          <h2>8. Trial, cancellation and refunds</h2>
          <p>
            New accounts get a 14-day free trial &mdash; no card required to start. You can
            subscribe at any point during or after the trial. Once subscribed, you can cancel at
            any time from Billing: you keep full access until the end of the period you&apos;ve
            already paid for, and we will not charge you again after that.
          </p>
          <p>
            If you are not happy with your subscription, contact us within 14 days of your first
            payment and we will refund it in full, no reason needed. Plans are billed through
            Stripe.
          </p>

          <h2>9. Your data if your access ends</h2>
          <p>
            If your trial ends without subscribing, or a subscription ends and is not renewed,
            your account becomes read-only: you can still sign in, see your jobs, and export your
            data, but you can&apos;t add or change jobs.
          </p>
          <p>
            Your calendar feed link keeps working for 30 days after that, then stops &mdash;
            turning the feed back on once you&apos;re subscribed again gives you a fresh address.
          </p>
          <p>
            We keep your account and its data for 90 days after it becomes read-only, in case you
            want to come back, with warnings before we delete it. You can export your data at any
            time before deletion from Account, or delete your account yourself sooner if
            you&apos;d rather.
          </p>

          <h2>10. Availability and support</h2>
          <p>
            We work to keep BookTight running but cannot promise it will always be available or
            error-free. We may carry out maintenance. Support is by email at{" "}
            <a href="mailto:support@booktight.co.uk">support@booktight.co.uk</a>, on a
            best-efforts basis.
          </p>

          <h2>11. Our liability</h2>
          <p>
            Nothing in these terms limits liability for death or personal injury caused by
            negligence, for fraud, or for anything else the law does not allow us to limit.
          </p>
          <p>
            Subject to that, we are not liable for loss of profit, missed or rescheduled jobs,
            lost customers, or any indirect or consequential loss. Our total liability to you for
            anything connected with BookTight is limited to the fees you paid us in the 12 months
            before the claim (or &pound;100 if you have paid nothing).
          </p>

          <h2>12. Ending your account</h2>
          <p>
            You can delete your account at any time from Account. We may suspend or close an
            account that breaks these terms, with notice where that is reasonable.
          </p>

          <h2>13. Changes</h2>
          <p>
            We may update these terms. For material changes we will give notice and ask you to
            accept the new version. Continuing to use BookTight after a minor change means you
            accept it.
          </p>

          <h2>14. Governing law</h2>
          <p>
            These terms are governed by the law of England and Wales, and the courts of England
            and Wales have jurisdiction.
          </p>

          <h2>15. Who we are and how to contact us</h2>
          <p>
            BookTight is a trading name of Muhammad Uthman Timol, a sole trader, of 57 Stamford
            Street, Manchester, Greater Manchester, M16 9JJ, United Kingdom. Email:{" "}
            <a href="mailto:support@booktight.co.uk">support@booktight.co.uk</a>.
          </p>
        </div>
      </div>

      <Footer />
      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
