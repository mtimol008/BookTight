"use server";

import { geocodeAddress } from "@/lib/geocoding";
import { validateBusinessRules } from "@/lib/businessRules";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface AccountFormState {
  error?: string;
}

export async function updateProfileBasics(
  _prevState: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const fullName = formData.get("fullName")?.toString().trim() ?? "";
  const businessNameRaw = formData.get("businessName")?.toString().trim() ?? "";
  const homeAddress = formData.get("homeAddress")?.toString().trim() ?? "";
  const timezone = formData.get("timezone")?.toString().trim() ?? "";

  if (!fullName || !homeAddress || !timezone) {
    return { error: "Full name, home address, and timezone are all required." };
  }

  // Re-geocode on every save, not just when the text looks different — the
  // same convention updateExistingJob uses for a job's address, so the
  // stored address and coordinates can never drift out of sync.
  const geocoded = await geocodeAddress(homeAddress);
  if (!geocoded) {
    return { error: `Could not find "${homeAddress}". Try a more specific address.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be logged in to update your account." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      home_address: geocoded.formattedAddress,
      home_latitude: geocoded.latitude,
      home_longitude: geocoded.longitude,
      business_name: businessNameRaw || null,
      timezone,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  // Every screen that computes a route or a suggestion reads the profile,
  // so a changed home address needs all of them fresh.
  revalidatePath("/", "layout");
  redirect("/account");
}

/**
 * Silently self-heals accounts still stuck on the dead 'UTC' default (see
 * 20260812000000_signup_timezone.sql) — called once from AppShell on every
 * page load with the browser's own detected zone. Only ever writes when
 * the stored value is still the untouched default; never overwrites a
 * value someone (or a previous call to this) already set for real, so a
 * deliberate edit in Account always sticks.
 */
export async function syncTimezoneIfDefault(detectedTimezone: string): Promise<void> {
  if (!detectedTimezone || detectedTimezone === "UTC") {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.timezone !== "UTC") {
    return;
  }

  await supabase.from("profiles").update({ timezone: detectedTimezone }).eq("id", user.id);
  revalidatePath("/", "layout");
}

export async function updateBusinessRules(
  _prevState: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const validated = validateBusinessRules(formData);
  if ("error" in validated) {
    return { error: validated.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be logged in to update your account." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      working_hours: validated.value.workingHours,
      distance_unit: validated.value.distanceUnit,
      max_travel_range_km: Math.round(validated.value.maxTravelRangeKm),
      max_jobs_per_day: validated.value.maxJobsPerDay,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/account");
}
