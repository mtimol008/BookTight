import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BackIcon } from "@/components/icons";
import { NewJobForm } from "@/components/NewJobForm";

export default function AddJobPage() {
  return (
    <AppShell>
      <div className="screen-head screen-head--center">
        <Link href="/" className="back-link" aria-label="Back to this week">
          <BackIcon />
        </Link>
        <h1 className="screen-title">Add a Job</h1>
      </div>

      <NewJobForm />
    </AppShell>
  );
}
