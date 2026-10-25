import { isTurnstileDisabled } from "./turnstileConfig";

// Server-side verification of a Cloudflare Turnstile token. Fails closed —
// a missing token, a bad response, a network error, or a missing secret
// key all return false rather than letting the caller through. The one
// exception is the kill switch (see turnstileConfig.ts), which is an
// intentional, explicit bypass, not a failure mode.
export async function verifyTurnstileToken(token: string | null): Promise<boolean> {
  if (isTurnstileDisabled()) return true;
  if (!token) return false;

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      }
    );

    if (!response.ok) return false;

    const data = await response.json();
    return data.success === true;
  } catch {
    return false;
  }
}
