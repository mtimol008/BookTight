"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { checkIpRateLimit, getClientIp } from "@/lib/rateLimit";
import { headers } from "next/headers";

export interface ForgotPasswordState {
  error?: string;
  message?: string;
}

// See login/actions.ts for why an app-level IP limit is needed alongside
// Turnstile and Supabase's own (Vercel-IP-pooled) limit. The tightest of
// the three thresholds — a real user has no reason to request more than a
// couple of reset emails in five minutes.
const FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MINUTES = 5;
const FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS = 5;

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = formData.get("email")?.toString().trim() ?? "";
  const turnstileToken = formData.get("turnstileToken")?.toString() ?? null;

  if (!email) {
    return { error: "Enter your email address." };
  }

  const ip = getClientIp(await headers());
  const allowed = await checkIpRateLimit(
    ip,
    "forgot_password",
    FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MINUTES,
    FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS
  );
  if (!allowed) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  const verified = await verifyTurnstileToken(turnstileToken);
  if (!verified) {
    return { error: "Verification failed. Please try again." };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const supabase = await createClient();
  // Deliberately ignore the result — always show the same message whether
  // or not the email belongs to an account, so this can't be used to
  // check which addresses have signed up.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/reset-password`,
  });

  return {
    message: "If that email has an account, a reset link is on its way.",
  };
}
