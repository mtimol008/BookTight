import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BackIcon } from "@/components/icons";
import { NewJobForm } from "@/components/NewJobForm";
import { getTotalJobCount } from "@/lib/jobs";
import { getCurrentProfile } from "@/lib/profiles";

/** Below this all-time job count, "Add another job" offers a fast path
 *  back into a fresh form instead of returning to This Week — a founder
 *  adding their first handful of jobs, not a hard rule. All-time, not
 *  "this week", since someone planning several weeks ahead in one sitting
 *  shouldn't be cut off just because the current week looks light. */
const EARLY_SESSION_JOB_COUNT = 5;

export default async function AddJobPage() {
  const [profile, totalJobCount] = await Promise.all([
    getCurrentProfile(),
    getTotalJobCount(),
  ]);

  return (
    <AppShell>
      <div className="screen-head screen-head--center">
        <Link href="/" className="back-link" aria-label="Back to this week">
          <BackIcon />
        </Link>
        <h1 className="screen-title">Add a Job</h1>
      </div>

      <NewJobForm
        distanceUnit={profile?.distance_unit ?? "km"}
        isEarlySession={totalJobCount < EARLY_SESSION_JOB_COUNT}
      />
    </AppShell>
  );
}
