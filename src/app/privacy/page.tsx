import { Footer } from "@/components/Footer";
import { TERMS_VERSION } from "@/lib/terms";

export default function PrivacyPage() {
  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 className="screen-title" style={{ marginBottom: 10 }}>Privacy Policy</h1>
        <p className="legal-meta">
          Last updated: 27 October 2026 &middot; Version: {TERMS_VERSION}
        </p>

        <div className="legal-doc">
          <h2>1. About this policy</h2>
          <p>
            BookTight (we, us) is run by a sole trader. Our full name, address and contact
            details are in section 13, at the bottom of this policy.
          </p>
          <p>
            BookTight is a scheduling tool for self-employed tradespeople and small businesses.
            This policy explains what personal data we handle, why we handle it, and your rights
            under UK GDPR and the Data Protection Act 2018.
          </p>

          <h2>2. Two roles</h2>
          <ul>
            <li>For your own account data (section 3a), we are the controller.</li>
            <li>
              For the details of your customers that you enter into BookTight (section 3b), you
              are the controller and we act as your processor. We handle that data only to
              provide the service. You are responsible for having a lawful reason to hold your
              customers&apos; data and for telling them how you use it.
            </li>
          </ul>

          <h2>3. What we collect</h2>
          <p>
            a) <strong>About you:</strong> email address, password (stored hashed by our sign-in
            provider, so we cannot read it), full name, business name, home or base address and
            its map coordinates, timezone, working-hours and travel preferences, the version of
            these terms you accepted and when, and subscription status once paid plans start.
          </p>
          <p>
            b) <strong>About your customers (entered by you):</strong> customer name, job address
            and map coordinates, date, time slot, duration, notes, status, and anything else you
            choose to enter.
          </p>
          <p>
            c) <strong>Technical data:</strong> IP address and request details (used for security
            and abuse prevention), error reports, and basic hosting logs. We do not use
            advertising or analytics trackers.
          </p>
          <p>
            d) <strong>Payments (once paid plans start):</strong> handled by Stripe. We receive
            your subscription status and identifiers, not your full card number.
          </p>

          <h2>4. Why we use it, and our legal basis</h2>
          <ul>
            <li>
              Providing your account and the scheduling service, including suggesting the best
              day for a job: <strong>contract</strong>.
            </li>
            <li>
              Turning addresses into map locations and distances: <strong>contract</strong>.
            </li>
            <li>
              Security, stopping bots and abuse, rate limiting and error monitoring:{" "}
              <strong>legitimate interests</strong> (keeping the service safe and working).
            </li>
            <li>
              Account emails such as confirmation, password reset and service notices:{" "}
              <strong>contract</strong> and <strong>legitimate interests</strong>.
            </li>
            <li>
              Billing and tax records: <strong>contract</strong> and{" "}
              <strong>legal obligation</strong>.
            </li>
          </ul>
          <p>
            We do not sell personal data, and we do not use it for advertising. Scheduling
            suggestions are advice that you are free to ignore. They are not decisions with legal
            effect.
          </p>

          <h2>5. Who we share it with</h2>
          <p>
            We use these providers to run BookTight, under terms that require them to protect
            your data:
          </p>
          <ul>
            <li>
              <strong>Supabase:</strong> database and sign-in. Data is stored in Frankfurt,
              Germany.
            </li>
            <li>
              <strong>Vercel:</strong> hosting. Our application servers run in Frankfurt, Germany.
              Vercel&rsquo;s global network also delivers the site and may handle requests briefly
              in other locations.
            </li>
            <li>
              <strong>Mapbox:</strong> converts addresses to map coordinates. Addresses you type
              are sent to Mapbox.
            </li>
            <li>
              <strong>Cloudflare (Turnstile):</strong> bot check on sign-up and password reset.
            </li>
            <li>
              <strong>Sentry:</strong> error monitoring, using an EU data centre. We do not store
              IP addresses in it and we remove personal details from reports.
            </li>
            <li>
              <strong>Resend:</strong> sends our account emails.
            </li>
            <li>
              <strong>Stripe:</strong> payments, once paid plans start.
            </li>
          </ul>
          <p>We may also disclose data where the law requires it.</p>

          <h2>6. Transfers outside the UK</h2>
          <p>
            Some providers may process data outside the UK and EEA, for example in the United
            States. Where they do, we rely on safeguards such as the UK&ndash;US Data Bridge, the
            UK International Data Transfer Addendum or Standard Contractual Clauses.
          </p>

          <h2>7. Cookies and similar technologies</h2>
          <p>
            We use only essential cookies: a sign-in session cookie from our authentication
            provider, and a security cookie from Cloudflare Turnstile on the sign-up, sign-in and
            password-reset pages. We use no analytics or advertising cookies, so there is no
            cookie banner. If that changes, we will ask first.
          </p>
          <p>
            <strong>Calendar feed:</strong> if you turn on the calendar feed, we create a private
            link that your calendar app uses to read your schedule. Anyone with that link can
            read your schedule, so keep it private. You can turn it off in Account.
          </p>

          <h2>8. How long we keep it</h2>
          <ul>
            <li>
              <strong>Account and job data:</strong> for as long as your account is open.
            </li>
            <li>
              <strong>If you delete your account:</strong> we delete your profile and jobs
              promptly. Copies in our provider&apos;s backups are kept for up to 7 days and then
              expire.
            </li>
            <li>
              <strong>If a paid subscription ends:</strong> you get read-only access and can
              export your data. We keep it for 90 days, with warnings before deletion. This
              applies once paid plans start.
            </li>
            <li>
              <strong>Address look-ups:</strong> results may be cached, not linked to your
              account, for up to 12 months so we do not repeat the same look-up.
            </li>
            <li>
              <strong>Security counters (such as rate-limit records):</strong> kept for a short
              period.
            </li>
            <li>
              <strong>Billing records:</strong> for as long as tax law requires.
            </li>
          </ul>

          <h2>9. Your rights</h2>
          <p>
            You can ask us to give you a copy of your data, correct it, delete it, restrict or
            object to how we use it, or move it to another service. You can export your data
            yourself in Account. You can withdraw consent where we rely on it. Contact{" "}
            <a href="mailto:support@booktight.co.uk">support@booktight.co.uk</a> and we will reply
            within one month.
          </p>
          <p>
            If you complain and are not happy with our answer, you can contact the Information
            Commissioner&apos;s Office (ico.org.uk, 0303 123 1113).
          </p>
          <p>
            If you are a customer of a tradesperson who uses BookTight, please contact them
            first. They decide how your data is used, and we will help them respond to you.
          </p>

          <h2>10. Security</h2>
          <p>
            We use encrypted connections (HTTPS), access rules so each account can see only its
            own data, rate limiting, and error monitoring with personal details removed. No
            system is perfectly secure. If a breach affects you, we will tell you and the ICO
            where the law requires it.
          </p>

          <h2>11. Children</h2>
          <p>BookTight is for businesses and is not intended for anyone under 18.</p>

          <h2>12. Changes to this policy</h2>
          <p>
            We will update the date and version above when this policy changes. We will flag
            material changes in the app or by email.
          </p>

          <h2>13. Who we are and how to contact us</h2>
          <p>BookTight is a trading name of Muhammad Uthman Timol, a sole trader.</p>
          <p>
            Address: 57 Stamford Street, Manchester, Greater Manchester, M16 9JJ, United Kingdom.
          </p>
          <p>
            Email: <a href="mailto:support@booktight.co.uk">support@booktight.co.uk</a>
          </p>
        </div>
      </div>

      <Footer />
      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
