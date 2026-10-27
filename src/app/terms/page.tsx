import { Footer } from "@/components/Footer";

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
        <h1 className="screen-title" style={{ marginBottom: 18 }}>Terms of Service</h1>
        <p>
          Our full terms of service are being written up and will be published here. In the
          meantime, if you have any questions, email{" "}
          <a href="mailto:support@booktight.co.uk">support@booktight.co.uk</a>.
        </p>
      </div>

      <Footer />
      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
