import { createClient } from "./supabase/server";
import type { DistanceUnit } from "./format";
import type { Weekday } from "./scheduling";

export interface ProfileRecord {
  id: string;
  full_name: string | null;
  home_address: string;
  home_latitude: number;
  home_longitude: number;
  business_name: string | null;
  /** Per weekday: on/off and "HH:MM" (24-hour, same shape as a job's
   *  specific_time) start/end. */
  working_hours: Record<Weekday, { enabled: boolean; start: string; end: string }>;
  max_travel_range_km: number;
  distance_unit: DistanceUnit;
  /** null = no cap. */
  max_jobs_per_day: number | null;
  /** null = onboarding not completed yet; gates the "/" screen. */
  onboarding_completed_at: string | null;
  created_at: string;
}

export async function getCurrentProfile(): Promise<ProfileRecord | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  return data;
}
