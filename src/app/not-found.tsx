import Link from "next/link";

// A plain Server Component — notFound() calls and genuinely unmatched
// routes both render this with no client-side error to catch, so there's
// no exception here to report. A spike in traffic hitting this page is
// visible as a spike in page views for it, which doesn't need a Sentry
// event of its own.
export default function NotFound() {
  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <h1 className="screen-title" style={{ marginBottom: 12 }}>Page not found</h1>
        <p style={{ marginBottom: 20 }}>
          That page doesn&apos;t exist, or the link&apos;s out of date.
        </p>
        <Link href="/" className="btn btn--primary btn--block">
          Back to Booktight
        </Link>
      </div>

      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
