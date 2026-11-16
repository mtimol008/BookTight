// Sentry client-side init. Error monitoring only — no Session Replay (it
// records the screen, a much bigger PII surface than this app needs) and
// no source-map upload yet (that needs SENTRY_AUTH_TOKEN, not set up yet).
import * as Sentry from "@sentry/nextjs";
import { scrubEvent, scrubBreadcrumb } from "@/lib/sentryScrub";

// NEXT_PUBLIC_VERCEL_ENV is Vercel's own automatically-injected system env
// var (unlike VERCEL_ENV, it's exposed to the browser bundle) — only ever
// set on an actual Vercel deployment (Preview or Production), never in
// local dev or a locally-run build/test. Guarding on it keeps every local
// run from reporting to the real Sentry project; see sentry.server.config.ts
// for the same guard on the server side.
if (process.env.NEXT_PUBLIC_VERCEL_ENV) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    // NOTE: this SDK version's installed types reject `sendDefaultPii` (the
    // docs mention it but it's not in this version's actual init options —
    // confirmed by tsc, not guessed). Relying on beforeSend/beforeBreadcrumb
    // below instead, which don't depend on that option existing.

    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
