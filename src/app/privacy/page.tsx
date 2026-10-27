import { Footer } from "@/components/Footer";

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
        <h1 className="screen-title" style={{ marginBottom: 18 }}>Privacy Policy</h1>
        <p style={{ marginBottom: 16 }}>
          Our full privacy policy is being written up and will be published here. In the
          meantime, if you have any questions about what data we hold or how it&apos;s used,
          email <a href="mailto:support@booktight.co.uk">support@booktight.co.uk</a>.
        </p>

        <h2 className="section-label" style={{ marginTop: 20, marginBottom: 8 }}>
          Cookies
        </h2>
        <p>
          Booktight uses one cookie to keep you signed in, set by our login system (Supabase) —
          this is required for the app to work and can&apos;t be switched off. Our signup, login
          and password-reset forms also load a bot-check widget from Cloudflare (Turnstile),
          which sets its own cookie on Cloudflare&apos;s domain for fraud prevention. We don&apos;t
          use any analytics, advertising, or tracking cookies, and we don&apos;t store anything in
          your browser&apos;s local storage.
        </p>
      </div>

      <Footer />
      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
