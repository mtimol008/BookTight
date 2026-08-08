"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface DeleteAccountFormState {
  error?: string;
}

export async function deleteAccount(
  _prevState: DeleteAccountFormState,
  formData: FormData
): Promise<DeleteAccountFormState> {
  const confirmedEmail = formData.get("confirmedEmail")?.toString().trim() ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be logged in to delete your account." };
  }

  if (confirmedEmail.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return { error: "That doesn't match your account's email address." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return { error: error.message };
  }

  // The auth user is already gone at this point, but a session cookie may
  // still be sitting in the browser — clear it before sending them off.
  await supabase.auth.signOut();
  redirect("/signup");
}
