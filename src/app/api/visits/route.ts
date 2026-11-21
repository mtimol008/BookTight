import { createAdminClient } from "@/lib/supabase/admin";
import { isVisitDevice, isVisitPath, normaliseVisitRef } from "@/lib/visit-tracking";

/**
 * Receives the anonymous visit beacon from / and /signup.
 *
 * No IP, user-agent, cookie or session is read or stored. A real browser
 * sends Sec-Fetch-Site/Sec-Fetch-Dest on a same-origin fetch, so requiring
 * them drops obvious non-browser callers (including bots that somehow do
 * run JS but aren't browsing the page). Invalid requests get the same
 * silent 204 as valid ones: this endpoint is not a data source for callers.
 */
export async function POST(request: Request) {
  if (
    request.headers.get("sec-fetch-site") !== "same-origin" ||
    request.headers.get("sec-fetch-dest") !== "empty"
  ) {
    return new Response(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  if (!body || typeof body !== "object") {
    return new Response(null, { status: 204 });
  }

  const { path, ref, device } = body as Record<string, unknown>;
  if (!isVisitPath(path) || !isVisitDevice(device)) {
    return new Response(null, { status: 204 });
  }

  try {
    const { error } = await createAdminClient().rpc("record_page_visit", {
      p_path: path,
      p_ref: normaliseVisitRef(ref),
      p_device: device,
    });
    if (error) return new Response(null, { status: 500 });
  } catch {
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
