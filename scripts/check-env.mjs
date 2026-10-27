// Runs automatically before every build (see package.json's "prebuild"
// script) and fails fast with a clear message if a required env var is
// missing — instead of a confusing mid-build crash (e.g. "Error occurred
// prerendering page '/add'") or, worse, a build that succeeds but deploys
// an app that's broken at runtime (e.g. /api/health silently returning
// "unhealthy" because SUPABASE_SECRET_KEY was never set on Vercel).
//
// Loads .env.local/.env the same way Next itself does, via @next/env (a
// transitive dependency of next, already in node_modules) — without this,
// a local `npm run build` would see an empty process.env here and always
// fail, since .env.local is only loaded by Next's own runtime, not by a
// plain `node` process running before it.
// @next/env ships as CommonJS, so named-import destructuring has to happen
// off the default export rather than directly off the module.
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd(), false);

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_SECRET_KEY",
  "MAPBOX_ACCESS_TOKEN",
];

// Turnstile verification is skipped entirely when the kill switch is on
// (see src/lib/turnstileConfig.ts) — TURNSTILE_SECRET_KEY is pointless to
// require in that case, and requiring it anyway would block a deliberate
// "Cloudflare is down, disable Turnstile" deploy.
if (process.env.NEXT_PUBLIC_TURNSTILE_DISABLED !== "true") {
  required.push("TURNSTILE_SECRET_KEY");
}

const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error("\nBuild aborted: missing required environment variable(s):");
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error(
    "\nSet these in Vercel -> Settings -> Environment Variables (Production), " +
      "or in .env.local for a local build.\n"
  );
  process.exit(1);
}
