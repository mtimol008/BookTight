"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/terms";

export async function acceptUpdatedTerms(formData: FormData): Promise<void> {
  const accepted = formData.get("termsAccepted")?.toString() === "on";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  if (!accepted) {
    redirect("/accept-terms?error=You must agree to continue.");
  }

  // Own-row update, same RLS policy signup's auto-created profile already
  // relies on ("Users can update their own profile") — no new policy or
  // migration needed for this.
  const { error } = await supabase
    .from("profiles")
    .update({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    redirect(`/accept-terms?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}
