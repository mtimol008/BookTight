"use server";

import { createClient } from "@/lib/supabase/server";
import { checkIpRateLimit, getClientIp } from "@/lib/rateLimit";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

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
// supabase.com/docs/guides/auth/rate-limits) — EXCEPT that limit is keyed
// on the request's own IP, which for every Booktight request is Vercel's
// server IP, not the real visitor's (this app still uses the legacy
// Supabase key pair, which Sb-Forwarded-For doesn't support — see
// rateLimit.ts). The app-level per-IP check below is the fix for that:
// tighter than Supabase's pooled limit, scoped to the real visitor.
const LOGIN_RATE_LIMIT_WINDOW_MINUTES = 5;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 15;

export async function signIn(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (!email || !password) {
    return { error: "Email and password are both required." };
  }

  const ip = getClientIp(await headers());
  const allowed = await checkIpRateLimit(
    ip,
    "login",
    LOGIN_RATE_LIMIT_WINDOW_MINUTES,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS
  );
  if (!allowed) {
    return { error: "Too many attempts. Please try again in a few minutes." };
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
