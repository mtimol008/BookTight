"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

// Catches an error thrown anywhere in this route segment's render/data —
// rendered inside the normal root layout (unlike global-error.tsx, which
// only fires for a crash in the layout itself), so the app's own
// stylesheet is already loaded here.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No extra scrubbing needed here — the same beforeSend hook every
    // Sentry runtime in this app is configured with (see
    // src/lib/sentryScrub.ts) already strips the message and reduces the
    // exception to just its type, regardless of where captureException is
    // called from.
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <h1 className="screen-title" style={{ marginBottom: 12 }}>Something went wrong</h1>
        <p style={{ marginBottom: 20 }}>
          That&apos;s on us, not you — we&apos;ve been told about it. Your data is safe.
        </p>
        <button type="button" className="btn btn--primary btn--block" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn btn--outline btn--block" style={{ marginTop: 10 }}>
          Back to Booktight
        </Link>
      </div>

      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
