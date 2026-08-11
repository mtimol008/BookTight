"use server";

import { validateBusinessRules } from "@/lib/businessRules";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface OnboardingFormState {
  error?: string;
}

export async function completeOnboarding(
  _prevState: OnboardingFormState,
  formData: FormData
): Promise<OnboardingFormState> {
  const validated = validateBusinessRules(formData);
  if ("error" in validated) {
    return { error: validated.error };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be logged in to continue." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      working_hours: validated.value.workingHours,
      distance_unit: validated.value.distanceUnit,
      max_travel_range_km: Math.round(validated.value.maxTravelRangeKm),
      max_jobs_per_day: validated.value.maxJobsPerDay,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
