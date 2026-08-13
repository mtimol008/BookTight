import { createAdminClient } from "./supabase/admin";
import type { StoredDayHours, Weekday } from "./scheduling";

const PROFILE_COLUMNS =
  "id, calendar_feed_token, calendar_feed_enabled, timezone, home_latitude, home_longitude, working_hours";

export interface CalendarFeedProfile {
  id: string;
  calendar_feed_token: string | null;
  calendar_feed_enabled: boolean;
  timezone: string;
  home_latitude: number;
  home_longitude: number;
  working_hours: Record<Weekday, StoredDayHours>;
}

/**
 * Looks up a profile by its feed token for the public, unauthenticated
 * .ics endpoint (Apple/Google/Outlook fetch this with no Supabase session,
 * so the normal cookie-scoped client would get blocked by RLS's
 * `to authenticated` policies). Uses the admin client instead — the
 * unguessable token itself is the auth check here, same as an API key.
 */
export async function getProfileByFeedToken(token: string): Promise<CalendarFeedProfile | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("calendar_feed_token", token)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch profile by feed token: ${error.message}`);
  }

  if (!data || !data.calendar_feed_enabled) {
    return null;
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