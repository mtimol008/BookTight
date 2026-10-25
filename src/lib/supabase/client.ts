import { createBrowserClient } from "@supabase/ssr";

// Browser-only client. Needed specifically for the password-reset confirm
// page: Supabase's recovery session arrives as tokens in the URL fragment,
// which only client-side JS ever sees — the server never gets a fragment,
// so a server action can't pick this session up on its own.
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
