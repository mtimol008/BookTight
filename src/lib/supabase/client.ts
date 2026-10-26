import { createBrowserClient } from "@supabase/ssr";

// Browser-only client. Needed specifically for the password-reset confirm
// page: Supabase's recovery session arrives as tokens in the URL fragment,
// which only client-side JS ever sees — the server never gets a fragment,
// so a server action can't pick this session up on its own.
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
