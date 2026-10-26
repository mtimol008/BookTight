import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Full admin access — bypasses Row Level Security entirely via the
// secret key. Only ever import this from a server action, and only for
// operations the regular client genuinely can't do (here: deleting a
// user's auth account, rate-limit checks). Never import this from a
// client component.
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. " +
        "Add SUPABASE_SECRET_KEY to .env.local — find it in the " +
        "Supabase dashboard under Settings > API."
    );
  }

  return createSupabaseClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
