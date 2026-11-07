"use server";

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { deleteAccountCore, StripeCancelError } from "@/lib/accountDeletion";
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

  try {
    await deleteAccountCore(user.id, user.email ?? "", "user_requested");
  } catch (err) {
    if (err instanceof StripeCancelError) {
      Sentry.captureException(err, { tags: { stage: "delete-account-cancel-subscription" } });
      return {
        error:
          "Couldn't cancel your Stripe subscription, so your account wasn't deleted. " +
          "Please try again, or contact support@booktight.co.uk.",
      };
    }
    Sentry.captureException(err, { tags: { stage: "delete-account" } });
    return { error: err instanceof Error ? err.message : "Something went wrong deleting your account." };
  }

  // The auth user is already gone at this point, but a session cookie may
  // still be sitting in the browser — clear it before sending them off.
  await supabase.auth.signOut();
  redirect("/signup");
}
