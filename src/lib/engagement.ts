import { createClient } from "./supabase/server";
import type { EngagementState } from "./profiles";

/**
 * Merges a partial patch into the current user's engagement_state.
 * Booleans overwrite; dismissedHints appends (deduped) rather than
 * replacing, since dismissing one hint shouldn't erase another dismissed
 * earlier in the same session. No-ops silently if not signed in — every
 * caller is best-effort UI bookkeeping (has this been shown, has that been
 * dismissed), not something worth failing loudly over.
 */
export async function updateEngagementState(patch: Partial<EngagementState>): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("engagement_state")
    .eq("id", user.id)
    .maybeSingle();

  const current: EngagementState = profile?.engagement_state ?? {};
  const next: EngagementState = { ...current, ...patch };

  if (patch.dismissedHints) {
    next.dismissedHints = Array.from(
      new Set([...(current.dismissedHints ?? []), ...patch.dismissedHints])
    );
  }

  await supabase.from("profiles").update({ engagement_state: next }).eq("id", user.id);
}
