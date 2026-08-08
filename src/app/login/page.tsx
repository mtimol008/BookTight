import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card">
        <LoginForm />
      </div>

      <p style={{ textAlign: "center", marginTop: 18 }}>
        <Link href="/signup" className="muted" style={{ fontSize: 13 }}>
          Create an account
        </Link>
      </p>

      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
