"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface LoginState {
  error?: string;
}

// No Turnstile check here, unlike signup/forgot-password — deliberately.
// Login is the one form where getting the bot-check wrong (a stale site
// key, Cloudflare having an outage) locks out every real user trying to
// use the app, not just new signups. Supabase's own built-in rate limit
// on /auth/v1/token (password sign-in) already covers brute-force/bot
// attempts here: 150 requests per 5 minutes per IP, burst up to 30,
// returning 429 once exceeded (confirmed against Supabase's current docs,
// supabase.com/docs/guides/auth/rate-limits).
export async function signIn(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!email || !password) {
    return { error: "Email and password are both required." };
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
