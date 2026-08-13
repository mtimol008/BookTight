"use server";

import { createClient } from "@/lib/supabase/server";
import { generateFeedToken } from "@/lib/calendarFeed";
import { revalidatePath } from "next/cache";

export interface CalendarFeedState {
  feedUrl?: string;
  error?: string;
  message?: string;
}

export async function enableCalendarFeed(): Promise<CalendarFeedState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not logged in" };
  }

  const token = generateFeedToken();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { error } = await supabase
    .from("profiles")
    .update({
      calendar_feed_token: token,
      calendar_feed_enabled: true,
    })
    .eq("id", user.id);

  if (error) {
    return { error: `Failed to enable feed: ${error.message}` };
  }

  revalidatePath("/account");
  return {
    feedUrl: `${baseUrl.replace(/\/$/, "")}/api/calendar/feed/${token}.ics`,
    message: "Calendar feed enabled",
  };
}

export async function disableCalendarFeed(): Promise<CalendarFeedState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not logged in" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      calendar_feed_enabled: false,
    })
    .eq("id", user.id);

  if (error) {
    return { error: `Failed to disable feed: ${error.message}` };
  }

  revalidatePath("/account");
  return { message: "Calendar feed disabled" };
}

export async function regenerateCalendarFeedToken(): Promise<CalendarFeedState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not logged in" };
  }

  const token = generateFeedToken();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { error } = await supabase
    .from("profiles")
    .update({
      calendar_feed_token: token,
    })
    .eq("id", user.id);

  if (error) {
    return { error: `Failed to regenerate token: ${error.message}` };
  }

  revalidatePath("/account");
  return {
    feedUrl: `${baseUrl.replace(/\/$/, "")}/api/calendar/feed/${token}.ics`,
    message: "Feed URL regenerated — update your calendar subscription",
  };
}