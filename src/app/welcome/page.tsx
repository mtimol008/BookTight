import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profiles";
import { chooseAddJobNow, chooseShowMeAround } from "./actions";

export default async function WelcomePage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!profile.onboarding_completed_at) {
    redirect("/onboarding");
  }
  if (profile.engagement_state?.entryChoiceMade) {
    redirect("/");
  }

  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card">
        <p style={{ marginBottom: 20 }}>
          Ready to get going, or want a quick look around first? Either way
          takes a minute.
        </p>

        <form action={chooseAddJobNow}>
          <button type="submit" className="btn btn--primary btn--block">
            Add a job now
          </button>
        </form>

        <form action={chooseShowMeAround} style={{ marginTop: 10 }}>
          <button type="submit" className="btn btn--outline btn--block">
            Show me around first
          </button>
        </form>
      </div>

      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
