"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { redirect } from "next/navigation";

export interface LoginState {
  error?: string;
}

export async function signIn(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const turnstileToken = formData.get("turnstileToken")?.toString() ?? null;

  if (!email || !password) {
    return { error: "Email and password are both required." };
  }

  const verified = await verifyTurnstileToken(turnstileToken);
  if (!verified) {
    return { error: "Verification failed. Please try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
