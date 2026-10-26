import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "./supabase/admin";
import { isRateLimitDisabled } from "./rateLimitConfig";

/**
 * The real visitor IP, as seen by Vercel's edge — x-forwarded-for is a
 * comma-separated hop list with the original client first, Vercel's own
 * proxy hops appended after, so only the first entry is trustworthy here.
 * Falls back to a fixed label in local dev (no proxy, no header) rather
 * than throwing — rate limiting degrades to "one shared bucket" locally,
 * which is fine since this never runs against real traffic there.
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return "local-dev";
}

/**
 * True if this IP is still under the cap for this action, atomically
 * incrementing as part of the check (see the migration's
 * check_and_increment_ip_rate_limit for why this has to be atomic).
 * Called via the service-role client — this function has no grant for
 * anon/authenticated, so there's no direct-RPC path for a client to call
 * it with a spoofed IP of its own choosing (see the migration's comment).
 *
 * Fails open on any DB error — a transient outage shouldn't itself lock
 * every visitor out of login/signup/forgot-password; this is an abuse
 * backstop, not a hard gate that's allowed to become a new single point
 * of failure for the thing it's protecting. Still reported to Sentry
 * either way (a silent fail-open is a silent loss of the protection this
 * exists for) — the error branch uses captureMessage with the detail in
 * tags/extra rather than the message itself, since scrubEvent redacts
 * event.message unconditionally (see sentryScrub.ts); the catch branch
 * uses captureException as normal, since scrubEvent already handles that
 * case project-wide (keeps the exception type and stack, drops the
 * message text).
 */
export async function checkIpRateLimit(
  ip: string,
  action: string,
  windowMinutes: number,
  limit: number
): Promise<boolean> {
  if (isRateLimitDisabled()) return true;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("check_and_increment_ip_rate_limit", {
      p_ip: ip,
      p_action: action,
      p_window_minutes: windowMinutes,
      p_limit: limit,
    });
    if (error) {
      Sentry.captureMessage("ip_rate_limit check failed, failing open", {
        level: "error",
        tags: { rateLimitAction: action },
        extra: { supabaseError: error.message },
      });
      return true;
    }
    return data !== false;
  } catch (err) {
    Sentry.captureException(err, { tags: { rateLimitAction: action } });
    return true;
  }
}
