import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BackIcon } from "@/components/icons";
import { BusinessRulesEditForm } from "@/components/BusinessRulesEditForm";
import { getCurrentProfile } from "@/lib/profiles";

export default async function EditBusinessRulesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <AppShell>
      <div className="screen-head screen-head--center">
        <Link href="/account" className="back-link" aria-label="Back to account">
          <BackIcon />
        </Link>
        <h1 className="screen-title">Business Rules</h1>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <BusinessRulesEditForm profile={profile} />
      </div>
    </AppShell>
  );
}
