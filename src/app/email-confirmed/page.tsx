import Link from "next/link";

export default function EmailConfirmedPage() {
  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 18 }}>Email confirmed</h1>
        <p style={{ marginBottom: 20 }}>
          Thanks — your email address is now confirmed. You can sign in and start using Booktight.
        </p>
        <Link href="/login" className="btn btn--primary btn--block">
          Sign in now
        </Link>
      </div>

      <p style={{ textAlign: "center", marginTop: 18 }}>
        <Link href="/signup" className="muted" style={{ fontSize: 13 }}>
          Need a new account?
        </Link>
      </p>

      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
