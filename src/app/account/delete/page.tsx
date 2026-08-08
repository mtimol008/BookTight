import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BackIcon } from "@/components/icons";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";
import { createClient } from "@/lib/supabase/server";

export default async function DeleteAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <div className="screen-head screen-head--center">
        <Link href="/account" className="back-link" aria-label="Back to account">
          <BackIcon />
        </Link>
        <h1 className="screen-title">Delete Account</h1>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <DeleteAccountForm email={user.email ?? ""} />
      </div>
    </AppShell>
  );
}
