import { createClient } from "./supabase/server";

export interface CalendarFeedProfile {
  id: string;
  calendar_feed_token: string | null;
  calendar_feed_enabled: boolean;
  timezone: string;
  home_latitude: number;
  home_longitude: number;
}

export async function getProfileByFeedToken(token: string): Promise<CalendarFeedProfile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, calendar_feed_token, calendar_feed_enabled, timezone, home_latitude, home_longitude")
    .eq("calendar_feed_token", token)
    .maybeSingle();

  if (error) {
    console.error("[calendar-feed] DB error:", error.message);
    throw new Error(`Failed to fetch profile by feed token: ${error.message}`);
  }

  console.log("[calendar-feed] DB query result:", data ? { id: data.id, token_match: data.calendar_feed_token === token, enabled: data.calendar_feed_enabled } : "no row");

  if (!data || !data.calendar_feed_enabled) {
    return null;
  }

  return data;
}

export async function getCurrentProfileWithFeed(): Promise<CalendarFeedProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, calendar_feed_token, calendar_feed_enabled, timezone, home_latitude, home_longitude")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  return data;
}

export function generateFeedToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function buildFeedUrl(token: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/calendar/feed/${token}.ics`;
}