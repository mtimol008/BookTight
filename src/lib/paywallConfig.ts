/**
 * Switch: set PAYWALL_ENABLED=true (Vercel env vars, or .env.local) to
 * start actually enforcing the entitlement check — before this is on,
 * hasActiveEntitlement() always returns true, so the whole subscriptions
 * system can ship and run quietly (new signups already get a real
 * trial_ends_at) without affecting anyone until this is flipped.
 *
 * Server-only (no NEXT_PUBLIC_ prefix): every place this is checked runs
 * server-side (job actions, /billing), nothing in the browser bundle needs
 * to see it.
 */
export function isPaywallEnabled(): boolean {
  return process.env.PAYWALL_ENABLED === "true";
}
