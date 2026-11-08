// Plain-JS twin of scripts/lib/supabaseTarget.ts, for scripts that run via
// plain `node` (which can't import .ts without a loader) rather than tsx.
// Keep both in sync by hand — see that file's own comment for why they're
// duplicated instead of shared.
const PROJECT_REFS = {
  staging: "etlnwiergqukhhscvrgv",
  production: "itijkrefaugbpagamxqr",
};

export function resolveTarget(argv = process.argv.slice(2)) {
  const targetArg = argv.find((a) => a.startsWith("--target="));
  const target = targetArg ? targetArg.slice("--target=".length) : "staging";
  if (target !== "staging" && target !== "production") {
    throw new Error(`--target must be "staging" or "production", got "${target}"`);
  }

  if (target === "production" && !argv.includes("--i-really-mean-production")) {
    throw new Error(
      "Refusing to run against production. This script creates and deletes real accounts — " +
        "pass --target=production --i-really-mean-production if that's genuinely what you want."
    );
  }

  const url = target === "staging" ? process.env.STAGING_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    target === "staging" ? process.env.STAGING_SUPABASE_SECRET_KEY : process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      target === "staging"
        ? "Missing STAGING_SUPABASE_URL / STAGING_SUPABASE_SECRET_KEY in .env.local."
        : "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local."
    );
  }

  const expectedRef = PROJECT_REFS[target];
  if (!url.includes(expectedRef)) {
    throw new Error(
      `--target=${target} expects a Supabase URL containing project ref "${expectedRef}", but got "${url}". ` +
        "The env vars for this target don't point where they should — stopping rather than guessing."
    );
  }

  // See supabaseTarget.ts's own comment: overwrites the standard
  // NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY names in this process's
  // env (never .env.local itself) so any app code that reads them
  // transparently talks to staging, without needing to know "staging"
  // exists.
  if (target === "staging") {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.SUPABASE_SECRET_KEY = secretKey;
  }

  console.log(`Target: ${target} (${expectedRef})`);
  return { target, url, secretKey };
}
