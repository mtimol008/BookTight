"use server";

import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe";
import { getSubscriptionByUserId } from "@/lib/subscriptions";
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

  const subscription = await getSubscriptionByUserId(user.id);

  // Cancel any real Stripe subscription first — abort the whole deletion
  // if this fails, rather than deleting the Supabase account out from
  // under a subscription Stripe is still going to keep billing.
  if (subscription?.stripe_subscription_id) {
    try {
      await getStripeClient().subscriptions.cancel(subscription.stripe_subscription_id);
    } catch (err) {
      Sentry.captureException(err, { tags: { stage: "delete-account-cancel-subscription" } });
      return {
        error:
          "Couldn't cancel your Stripe subscription, so your account wasn't deleted. " +
          "Please try again, or contact support@booktight.co.uk.",
      };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return { error: error.message };
  }

  // Best-effort from here — the Supabase account is already gone, which is
  // what the user actually asked for and confirmed, so a Stripe customer
  // cleanup failure at this point is worth knowing about but not worth
  // showing as an error for something that, from the user's side, already
  // succeeded.
  if (subscription?.stripe_customer_id) {
    try {
      await getStripeClient().customers.del(subscription.stripe_customer_id);
    } catch (err) {
      Sentry.captureException(err, { tags: { stage: "delete-account-delete-customer" } });
    }
  }

  // The auth user is already gone at this point, but a session cookie may
  // still be sitting in the browser — clear it before sending them off.
  await supabase.auth.signOut();
  redirect("/signup");
}
