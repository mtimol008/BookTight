import { Footer } from "@/components/Footer";

export default function ContactPage() {
  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 className="screen-title" style={{ marginBottom: 18 }}>Contact us</h1>
        <p>
          Questions, problems, or anything else — email{" "}
          <a href="mailto:support@booktight.co.uk">support@booktight.co.uk</a> and we&apos;ll get
          back to you.
        </p>
      </div>

      <Footer />
      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
