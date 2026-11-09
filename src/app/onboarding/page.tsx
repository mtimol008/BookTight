import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/OnboardingForm";
import { getCurrentProfile } from "@/lib/profiles";

export const metadata: Metadata = {
  title: "Set up your account",
};

export default async function OnboardingPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (profile.onboarding_completed_at) {
    redirect("/");
  }

  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <h1 className="tagline" style={{ marginTop: 6 }}>
          A couple of settings before you get started
        </h1>
      </div>

      <div className="card">
        <OnboardingForm profile={profile} />
      </div>

      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
