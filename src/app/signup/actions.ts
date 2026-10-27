"use server";

import { geocodeAddress } from "@/lib/geocoding";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { checkIpRateLimit, getClientIp } from "@/lib/rateLimit";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export interface SignUpState {
  error?: string;
  message?: string;
}

// Defense-in-depth alongside Turnstile, not a replacement for it — Turnstile
// stops a scripted bot outright, this stops the same real IP from
// retrying past a captcha-solving farm or a human abuser indefinitely. See
// login/actions.ts for why an app-level IP limit is needed here at all
// (Supabase's own per-IP limit sees Vercel's IP, not the visitor's).
const SIGNUP_RATE_LIMIT_WINDOW_MINUTES = 5;
const SIGNUP_RATE_LIMIT_MAX_ATTEMPTS = 8;

export async function signUp(
  _prevState: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const fullName = formData.get("fullName")?.toString().trim() ?? "";
  const businessName = formData.get("businessName")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";
  const homeAddress = formData.get("homeAddress")?.toString().trim() ?? "";
  const timezone = formData.get("timezone")?.toString().trim() || undefined;
  const turnstileToken = formData.get("turnstileToken")?.toString() ?? null;
  const termsAccepted = formData.get("termsAccepted")?.toString() === "on";
  const termsVersion = formData.get("termsVersion")?.toString().trim() || undefined;

  if (!fullName || !email || !password || !confirmPassword || !homeAddress) {
    return { error: "Full name, email, password, confirmation, and home address are all required." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  // Server-side, not just the submit button's disabled state — a modified
  // client could strip the checkbox's required attribute and submit anyway.
  if (!termsAccepted) {
    return { error: "You must agree to the Terms of Service and Privacy Policy to create an account." };
  }

  // Cheapest check first — an IP that's already over the cap never even
  // reaches the Turnstile verification call.
  const ip = getClientIp(await headers());
  const allowed = await checkIpRateLimit(
    ip,
    "signup",
    SIGNUP_RATE_LIMIT_WINDOW_MINUTES,
    SIGNUP_RATE_LIMIT_MAX_ATTEMPTS
  );
  if (!allowed) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  // Must run before the geocode call and before auth.signUp — both cost
  // real money/quota, and neither should run for an unverified request.
  const verified = await verifyTurnstileToken(turnstileToken);
  if (!verified) {
    return { error: "Verification failed. Please try again." };
  }

  const geocoded = await geocodeAddress(homeAddress);
  if (!geocoded) {
    return {
      error: `Could not find "${homeAddress}". Try a more specific address.`,
    };
  }

  const supabase = await createClient();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/email-confirmed`,
      data: {
        full_name: fullName,
        // Optional — an empty string would store "" rather than a real
        // absence, and the Account header checks for null to decide
        // whether to render the business line at all.
        business_name: businessName || null,
        home_address: geocoded.formattedAddress,
        home_latitude: geocoded.latitude,
        home_longitude: geocoded.longitude,
        // Undefined (JS disabled, very old cached page) omits the key
        // entirely rather than sending the literal string "undefined" —
        // the handle_new_user trigger's own coalesce(..., 'UTC') covers
        // that case.
        timezone,
        terms_version: termsVersion,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // If email confirmation is required (Supabase's default), there's no
  // session yet — send them to log in once they've confirmed instead of
  // redirecting straight into the app.
  if (data.session) {
    redirect("/");
  }

  return {
    message:
      "Account created. Check your email for a confirmation link, then log in.",
  };
}
