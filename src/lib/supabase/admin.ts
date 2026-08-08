import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Full admin access — bypasses Row Level Security entirely via the
// service_role key. Only ever import this from a server action, and only
// for operations the anon client genuinely can't do (here: deleting a
// user's auth account). Never import this from a client component.
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Add SUPABASE_SERVICE_ROLE_KEY to .env.local — find it in the " +
        "Supabase dashboard under Settings > API."
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
