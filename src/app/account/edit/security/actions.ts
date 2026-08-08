"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface SecurityFormState {
  error?: string;
  message?: string;
}

export async function updateSecurity(
  _prevState: SecurityFormState,
  formData: FormData
): Promise<SecurityFormState> {
  const email = formData.get("email")?.toString().trim() ?? "";
  const currentPassword = formData.get("currentPassword")?.toString() ?? "";
  const newPassword = formData.get("newPassword")?.toString() ?? "";
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

  if (!email) {
    return { error: "Email is required." };
  }

  if (newPassword && !currentPassword) {
    return { error: "Enter your current password to set a new one." };
  }

  if (newPassword && newPassword !== confirmPassword) {
    return { error: "New password and confirmation don't match." };
  }

  if (newPassword && newPassword.length < 6) {
    return { error: "New password must be at least 6 characters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be logged in to update your account." };
  }

  // signInWithPassword re-checks the password against the account's real
  // hash without touching the current session, so a stolen/left-open
  // session can't be used to set a new password without knowing the old
  // one — updateUser() alone would trust the session and skip this check.
  if (newPassword) {
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email ?? "",
      password: currentPassword,
    });
    if (reauthError) {
      return { error: "Current password is incorrect." };
    }
  }

  const emailChanged = email !== user.email;

  const { error } = await supabase.auth.updateUser({
    ...(emailChanged ? { email } : {}),
    ...(newPassword ? { password: newPassword } : {}),
  });

  if (error) {
    return { error: error.message };
  }

  if (!emailChanged && !newPassword) {
    return { message: "Nothing to change." };
  }

  if (emailChanged) {
    redirect("/account?securityMessage=Check your new email address for a confirmation link.");
  }

  redirect("/account?securityMessage=Password updated.");
}
