import { createAdminClient } from "@/lib/supabase/admin";

/**
 * For the uptime monitor (Phase 2 plan) — a cheap DB round-trip so a stuck
 * Supabase connection shows as "down", not just a static page that'd still
 * return 200 on its own. Deliberately returns no data, just a status: the
 * monitor only needs success/failure, and this shouldn't become a second
 * way to leak schema details.
 */
export async function GET() {
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
