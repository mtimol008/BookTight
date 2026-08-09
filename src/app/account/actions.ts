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

  if (!fullName || !homeAddress) {
    return { error: "Full name and home address are both required." };
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
      working_hours_start: validated.value.workingHoursStart,
      working_hours_end: validated.value.workingHoursEnd,
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
