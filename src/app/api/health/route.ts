import { createAdminClient } from "@/lib/supabase/admin";
import { checkIpRateLimit, getClientIp } from "@/lib/rateLimit";

const RATE_LIMIT_WINDOW_MINUTES = 5;
// Generous relative to any real uptime monitor's check interval (typically
// every 1-5 minutes) — this is a backstop against the route being hammered
// directly, not a budget a real monitor could ever bump into.
const RATE_LIMIT_MAX_REQUESTS = 30;

/**
 * For the uptime monitor (Phase 2 plan) — a cheap DB round-trip so a stuck
 * Supabase connection shows as "down", not just a static page that'd still
 * return 200 on its own. Deliberately returns no data, just a status: the
 * monitor only needs success/failure, and this shouldn't become a second
 * way to leak schema details. Public and unauthenticated by necessity (the
 * monitor has no session), so it's rate-limited per IP like the other
 * public endpoints — the query itself is already about as cheap as a real
 * query gets (single indexed row, no joins), but a direct flood of
 * requests still shouldn't be free to run against the database.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request.headers);
  const allowed = await checkIpRateLimit(
    ip,
    "health",
    RATE_LIMIT_WINDOW_MINUTES,
    RATE_LIMIT_MAX_REQUESTS
  );
  if (!allowed) {
    return new Response("rate limited", { status: 429 });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error) {
      return new Response("unhealthy", { status: 503 });
    }
    return new Response("ok", { status: 200 });
  } catch {
    return new Response("unhealthy", { status: 503 });
  }
}
