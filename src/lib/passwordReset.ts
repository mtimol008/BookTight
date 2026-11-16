import { createClient } from "@supabase/supabase-js";

/**
 * Sends Supabase's reset-password email.
 *
 * Deliberately NOT the cookie-based server client from ./supabase/server:
 * that one comes from @supabase/ssr, which forces flowType "pkce". A PKCE
 * reset request makes the email's link land on /reset-password?code=...,
 * but ResetPasswordForm only understands the hash-fragment format
 * (#access_token=...&type=recovery) — so every real reset email showed
 * "This link is invalid or has expired". The implicit flow used here makes
 * Supabase issue exactly that hash-fragment link. It also works when the
 * email is opened on a different device from the one that asked for it,
 * which a PKCE link can't (its verifier lives in the requesting browser's
 * cookies).
 *
 * `fetchImpl` exists only so scripts/test-password-reset-request.ts can
 * inspect the outgoing request without sending a real email.
 */
export async function sendPasswordResetEmail(
  email: string,
  redirectTo: string,
  fetchImpl?: typeof fetch
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });

  // Result deliberately ignored by the caller — see forgot-password/actions.ts.
  await supabase.auth.resetPasswordForEmail(email, { redirectTo });
}
