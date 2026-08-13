import type { User } from "@supabase/supabase-js";
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
  /** IANA zone (e.g. "Europe/London") — used to render real clock times in
   *  the .ics calendar export. */
  timezone: string;
  /** null = no cap. */
  max_jobs_per_day: number | null;
  /** null = onboarding not completed yet; gates the "/" screen. */
  onboarding_completed_at: string | null;
  /** null until the feed's been enabled at least once. */
  calendar_feed_token: string | null;
  calendar_feed_enabled: boolean;
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

/**
 * Profile + auth user together from a single auth check and a single query
 * — for Account, the one screen that needs both the profile row and the
 * user's email (which lives on auth.users, not profiles). Account used to
 * call getCurrentProfile() (its own auth check + query), then re-check auth
 * again directly for the email, then re-check auth and re-query a third
 * time inside the calendar feed state lookup — three round trips to
 * Supabase Auth and two profile queries for one page. This is the same
 * work in one round trip and one query; everywhere else that only needs
 * the profile should keep using getCurrentProfile().
 */
export async function getCurrentProfileWithUser(): Promise<
  { profile: ProfileRecord; user: User } | null
> {
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

  if (!data) {
    return null;
  }

  return { profile: data, user };
}
