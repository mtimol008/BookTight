import { Footer } from "@/components/Footer";
import { TERMS_VERSION } from "@/lib/terms";

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
          Last updated: 27 October 2026 &middot; Version: {TERMS_VERSION}
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

          <h2>3. Beta period</h2>
          <p>
            While BookTight is in beta it may change, have faults or be withdrawn. We will try to
            give notice of major changes. Please use the export feature to keep your own copy of
            your data.
          </p>

          <h2>4. What BookTight does</h2>
          <p>
            BookTight suggests days and times for new jobs to reduce your driving. The
            suggestions are advice only. Distances and travel estimates are approximate and
            addresses may be located inaccurately. You are responsible for checking a suggestion
            before you rely on it and for the jobs you accept.
          </p>

          <h2>5. Your account</h2>
          <p>
            Give us accurate information, keep your password secure, and do not share your
            account. Tell us promptly if you think someone else has accessed it.
          </p>

          <h2>6. Acceptable use</h2>
          <p>You must not:</p>
          <ul>
            <li>use BookTight unlawfully;</li>
            <li>scrape it, or use bots or automated tools to access it;</li>
            <li>get around its limits or its bot protection;</li>
            <li>interfere with how it works or try to access anyone else&apos;s data;</li>
            <li>enter data you have no right to use.</li>
          </ul>

          <h2>7. Your data</h2>
          <p>
            You keep ownership of the data you enter. You give us permission to process it to
            provide BookTight, as described in our Privacy Policy. You are responsible for having
            a lawful reason to hold your customers&apos; data and for telling them how you use
            it. You can export your data at any time from Account.
          </p>

          <h2>8. Cost during the beta</h2>
          <p>
            BookTight is free during the beta. We plan to introduce paid plans later. Before we
            charge you anything, we will tell you the price and give you notice, and you can
            choose whether to continue.
          </p>

          <h2>9. If paid plans are introduced</h2>
          <p>
            When paid plans start, we will update these terms and ask you to accept the new
            version before you are charged. Plans will be billed through Stripe and you will be
            able to cancel at any time.
          </p>

          <h2>10. Your data if your access ends</h2>
          <p>
            If your account is closed, or a future paid plan ends, you can export your data
            first. We keep it for 90 days before deletion, and we will warn you before we delete
            it.
          </p>

          <h2>11. Availability and support</h2>
          <p>
            We work to keep BookTight running but cannot promise it will always be available or
            error-free. We may carry out maintenance. Support is by email at{" "}
            <a href="mailto:support@booktight.co.uk">support@booktight.co.uk</a>, on a
            best-efforts basis.
          </p>

          <h2>12. Our liability</h2>
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

          <h2>13. Ending your account</h2>
          <p>
            You can delete your account at any time from Account. We may suspend or close an
            account that breaks these terms, with notice where that is reasonable.
          </p>

          <h2>14. Changes</h2>
          <p>
            We may update these terms. For material changes we will give notice and ask you to
            accept the new version. Continuing to use BookTight after a minor change means you
            accept it.
          </p>

          <h2>15. Governing law</h2>
          <p>
            These terms are governed by the law of England and Wales, and the courts of England
            and Wales have jurisdiction.
          </p>

          <h2>16. Who we are and how to contact us</h2>
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
