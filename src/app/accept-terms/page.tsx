import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profiles";
import { TERMS_VERSION } from "@/lib/terms";
import { acceptUpdatedTerms } from "./actions";

export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (profile.terms_version === TERMS_VERSION) {
    redirect("/");
  }

  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Our Terms of Service and Privacy Policy have been updated
        </div>
      </div>

      <div className="card">
        <p style={{ marginBottom: 16 }}>
          Please review the updated{" "}
          <Link href="/terms" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </Link>{" "}
          before continuing.
        </p>

        <form action={acceptUpdatedTerms}>
          <label
            className="field"
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
          >
            <input type="checkbox" name="termsAccepted" required style={{ marginTop: 3 }} />
            <span className="note" style={{ margin: 0 }}>
              I agree to the updated Terms of Service and Privacy Policy.
            </span>
          </label>

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary btn--block"
            style={{ marginTop: 16 }}
          >
            Continue
          </button>
        </form>
      </div>

      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
