/**
 * Kill switch: set NEXT_PUBLIC_TURNSTILE_DISABLED=true (in .env.local, or
 * in Vercel's environment variables) to turn Turnstile off everywhere —
 * forms stop rendering the widget and stop requiring a token, and the
 * server stops verifying — with no code change needed. Exists so a broken
 * site/secret key pair, or Cloudflare itself being down, can't lock every
 * user out of login/signup/password-reset at once.
 *
 * NEXT_PUBLIC_-prefixed (not server-only) deliberately: the client-side
 * gating (which widgets render, which submit buttons wait on a token) has
 * to see the same switch the server does, or a disabled server check would
 * still leave every submit button stuck waiting for a token no widget is
 * producing.
 */
export function isTurnstileDisabled(): boolean {
  return process.env.NEXT_PUBLIC_TURNSTILE_DISABLED === "true";
}
