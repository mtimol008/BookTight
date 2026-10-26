/**
 * Kill switch: set NEXT_PUBLIC_RATE_LIMIT_DISABLED=true (in .env.local, or
 * in Vercel's environment variables, THEN TRIGGER A REDEPLOY — Next.js
 * inlines NEXT_PUBLIC_ vars into the server bundle at build time, so
 * saving the var alone has no effect until a new deployment runs) to turn
 * the per-IP rate limiter off everywhere it's used — login, signup,
 * forgot-password, /api/csp-report, /api/health. Exists so a bug in the
 * limiter (wrong IP extraction, a stuck DB row) can't itself lock out real
 * users; same pattern as Turnstile's kill switch (turnstileConfig.ts).
 */
export function isRateLimitDisabled(): boolean {
  return process.env.NEXT_PUBLIC_RATE_LIMIT_DISABLED === "true";
}
