import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BackIcon } from "@/components/icons";
import { SecurityEditForm } from "@/components/SecurityEditForm";
import { createClient } from "@/lib/supabase/server";

export default async function EditSecurityPage() {
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
        <h1 className="screen-title">Login &amp; Security</h1>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <SecurityEditForm email={user.email ?? ""} />
      </div>
    </AppShell>
  );
}
