import type { NextConfig } from "next";

// Derived from the same env vars the app already uses at runtime, rather
// than hardcoded, so the CSP doesn't silently drift from the real
// Supabase project or Sentry DSN if either ever changes.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";
const sentryOrigin = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin
  : "";

// Enforced on Vercel Preview deployments only, for now — Production stays
// report-only until a run on Preview confirms nothing legitimate gets
// blocked (see the commit that added this). 'unsafe-inline' on script-src
// is unchanged either way: Next streams the RSC payload and hydration data
// through inline <script> tags on every page, and removing it needs the
// documented nonce approach, which forces every currently-static page
// (login, signup, forgot-password, reset-password) into dynamic rendering
// — a real, unrequested performance trade-off, not something to flip
// silently while tightening enforcement. Enforcing therefore does NOT yet
// block inline-script injection; it's real, meaningful hardening for
// everything else (object-src, base-uri, form-action, frame-src, blocking
// any resource from a domain not on this list at all), just not that one
// specific gap.
// React's dev-mode debugging and Turbopack's HMR runtime both use eval() —
// confirmed as a dev-only need (Next's own CSP guide makes the same
// exception), not something production traffic should ever allow.
const isDev = process.env.NODE_ENV === "development";
const isVercelPreview = process.env.VERCEL_ENV === "preview";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigin} ${sentryOrigin} https://challenges.cloudflare.com`.trim(),
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Relative path — the browser resolves it against the page's own
  // origin, so this works unchanged on both booktight.co.uk and the
  // legacy book-tight.vercel.app domain. report-uri is deprecated in
  // favor of the newer Reporting API (report-to), but it's still the
  // simplest widely-supported way to collect CSP violations today — see
  // /api/csp-report's own comment for why this exists before enforcing.
  "report-uri /api/csp-report",
]
  .join("; ");

// Same policy either way — only whether the browser actually enforces it
// differs. Report-Only never blocks anything, just logs; Preview is the
// one place it's enforced for real before Production gets the same
// treatment.
const cspHeaderKey = isVercelPreview
  ? "Content-Security-Policy"
  : "Content-Security-Policy-Report-Only";

const nextConfig: NextConfig = {
  // Lets other devices on the home network load dev resources (HMR etc.)
  // when testing the app on a real phone. Next blocks cross-origin dev
  // requests by default so a random site can't reach your dev server.
  //
  // Development only — this has no effect on a production build. If the
  // router hands out a different address, update this list.
  allowedDevOrigins: ["192.168.1.217"],

  // Stops the app announcing "X-Powered-By: Next.js" on every response —
  // trivial, but there's no reason to hand out free framework fingerprinting.
  poweredByHeader: false,

  // The landing screenshots are pre-exported WebPs at exactly these two
  // widths (scripts/landing-screenshots/export.mjs), served by a custom
  // loader, so next/image's srcset lists just "780w, 1170w" — no widths
  // that don't exist as files, and nothing larger than the 1170px capture.
  // They're the only next/image use in the app; a future image that needs
  // other widths should add them here.
  images: {
    imageSizes: [780],
    deviceSizes: [1170],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: cspHeaderKey, value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
