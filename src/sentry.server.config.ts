import * as Sentry from "@sentry/nextjs";
import { scrubEvent, scrubBreadcrumb } from "@/lib/sentryScrub";

// VERCEL_ENV is only ever set on an actual Vercel deployment (Preview or
// Production) — never in local dev, a locally-run `next build`/`next start`
// (including every staging-pointed local build used for testing), or a
// test script. Guarding on it, rather than NODE_ENV, keeps every one of
// those from reporting to the real Sentry project.
if (process.env.VERCEL_ENV) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
