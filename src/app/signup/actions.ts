"use server";

import { geocodeAddress } from "@/lib/geocoding";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface SignUpState {
  error?: string;
  message?: string;
}

export async function signUp(
  _prevState: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const fullName = formData.get("fullName")?.toString().trim() ?? "";
  const businessName = formData.get("businessName")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const homeAddress = formData.get("homeAddress")?.toString().trim() ?? "";

  if (!fullName || !email || !password || !homeAddress) {
    return { error: "Full name, email, password, and home address are all required." };
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
      emailRedirectTo: `${appUrl}/login`,
      data: {
        full_name: fullName,
        // Optional — an empty string would store "" rather than a real
        // absence, and the Account header checks for null to decide
        // whether to render the business line at all.
        business_name: businessName || null,
        home_address: geocoded.formattedAddress,
        home_latitude: geocoded.latitude,
        home_longitude: geocoded.longitude,
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
