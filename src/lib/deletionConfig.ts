/**
 * Switch: set DELETION_ENABLED=true (Vercel env vars, or .env.local) to let
 * the 90-day deletion cron actually delete accounts. Before this is on, the
 * cron still runs, still sets/clears lapsed_at, and still sends every
 * warning email on schedule — only the final delete step is skipped, so the
 * whole flow can run for real in production (and prove the emails land and
 * the timing is right) before anything irreversible happens. Mirrors
 * PAYWALL_ENABLED's own off-by-default shape in src/lib/paywallConfig.ts.
 */
export function isDeletionEnabled(): boolean {
  return process.env.DELETION_ENABLED === "true";
}
