"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Only fires if the root layout itself throws — rare, but when it does,
// this REPLACES <html>/<body> entirely, so globals.css (imported by the
// now-bypassed layout.tsx) may never have loaded. Inline styles only,
// deliberately, rather than the app's usual CSS classes.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Same global beforeSend scrub as every other capture in this app —
    // see src/lib/sentryScrub.ts.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf9f6",
          color: "#1b1f24",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 400,
            width: "100%",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid rgba(27, 31, 36, 0.1)",
            borderRadius: 12,
            padding: 28,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: "0.05em", marginBottom: 16 }}>
            BOOKTIGHT
          </div>
          <h1 style={{ fontSize: 16, margin: "0 0 10px" }}>Something went wrong</h1>
          <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 20px" }}>
            That&apos;s on us, not you — we&apos;ve been told about it. Your data is safe.
          </p>
          {/* A plain anchor, not next/link, is deliberate here — the root
              layout (and whatever client router context it carries) just
              crashed, so this avoids depending on it still working. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "block",
              background: "#e8a93a",
              color: "#1b1f24",
              fontWeight: 600,
              textDecoration: "none",
              borderRadius: 8,
              padding: "12px 0",
            }}
          >
            Back to Booktight
          </a>
        </div>
      </body>
    </html>
  );
}
