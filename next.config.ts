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

// Report-only for now (security review finding #5) — this collects
// violation reports in the browser console without blocking anything, so
// it can be checked against real traffic (Turnstile's widget/iframe,
// Sentry's own beacon calls, Next's own hydration scripts) before ever
// switching to enforcing. Deliberately NOT nonce-based: Next's documented
// nonce pattern requires every page to opt out of static rendering, which
// would be a real, unrequested performance change for several of this
// app's pages (login, signup, forgot-password, reset-password are all
// static today) — flagging that trade-off rather than accepting it
// silently. 'unsafe-inline' here means this CSP does NOT yet block
// inline-script injection — it's a monitoring baseline, not the fix for
// the cookie/XSS exposure the same review flagged.
// React's dev-mode debugging and Turbopack's HMR runtime both use eval() —
// confirmed as a dev-only need (Next's own CSP guide makes the same
// exception), not something production traffic should ever allow.
const isDev = process.env.NODE_ENV === "development";

const cspReportOnly = [
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
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
        ],
      },
    ];
  },
};

export default nextConfig;
