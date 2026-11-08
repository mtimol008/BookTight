// Shared by every script that creates/deletes real Supabase data (currently
// scripts/test-deletion-cron.ts). Picks staging by default; production
// requires BOTH --target=production AND --i-really-mean-production, so a
// bare re-run or a copy-pasted command can never silently land on
// production. See scripts/lib/supabase-target.mjs for the plain-JS twin
// used by .mjs scripts (tsx can import this file directly; plain `node`
// can't import .ts without a loader, hence the duplicate).
export type SupabaseTarget = "staging" | "production";

const PROJECT_REFS: Record<SupabaseTarget, string> = {
  staging: "etlnwiergqukhhscvrgv",
  production: "itijkrefaugbpagamxqr",
};

export interface TargetCredentials {
  target: SupabaseTarget;
  url: string;
  secretKey: string;
}

export function resolveTarget(argv: string[] = process.argv.slice(2)): TargetCredentials {
  const targetArg = argv.find((a) => a.startsWith("--target="));
  const target = (targetArg ? targetArg.slice("--target=".length) : "staging") as SupabaseTarget;
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

  // createAdminClient() in src/lib/supabase/admin.ts — used both directly by
  // this script and internally by every src/lib/* function under test
  // (runDeletionWarningsJob, deleteAccountCore, etc.) — always reads the
  // standard NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY names, with no
  // concept of "staging" or "production". Rather than threading a target
  // through every one of those functions, this overwrites the standard
  // names in this process's own env for staging, so the real code under
  // test transparently talks to staging without knowing it exists. Never
  // touches .env.local itself — only this process's in-memory env.
  if (target === "staging") {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.SUPABASE_SECRET_KEY = secretKey;
  }

  console.log(`Target: ${target} (${expectedRef})`);
  return { target, url, secretKey };
}
