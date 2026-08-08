import Link from "next/link";
import { SignUpForm } from "@/components/SignUpForm";

export default function SignUpPage() {
  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card">
        <SignUpForm />
      </div>

      <p style={{ textAlign: "center", marginTop: 18 }}>
        <Link href="/login" className="muted" style={{ fontSize: 13 }}>
          Already have an account? Sign in
        </Link>
      </p>

      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
