import { createBrowserClient } from "@supabase/ssr";

// Browser-only client. Needed specifically for the password-reset confirm
// page: Supabase's recovery session arrives as tokens in the URL fragment,
// which only client-side JS ever sees — the server never gets a fragment,
// so a server action can't pick this session up on its own.
//
// Note for whoever next touches the recovery flow: @supabase/ssr's
// createBrowserClient hard-codes flowType: "pkce" (see its own
// createBrowserClient.js — it spreads your auth options, then
// unconditionally overwrites flowType regardless of what you pass).
// There is no option on this client that makes it recognize the legacy
// hash-fragment recovery link (#access_token=...&type=recovery) that
// Supabase's current email template actually sends. ResetPasswordForm
// works around this itself, by reading the fragment and calling
// supabase.auth.setSession() directly instead of relying on this client's
// automatic detectSessionInUrl.
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
