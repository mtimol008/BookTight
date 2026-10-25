"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";

export interface ForgotPasswordState {
  error?: string;
  message?: string;
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = formData.get("email")?.toString().trim() ?? "";
  const turnstileToken = formData.get("turnstileToken")?.toString() ?? null;

  if (!email) {
    return { error: "Enter your email address." };
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
