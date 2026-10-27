import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { Footer } from "@/components/Footer";

export default function ResetPasswordPage() {
  return (
    <main className="shell shell--bare">
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="wordmark wordmark--lg">Booktight</div>
        <div className="tagline" style={{ marginTop: 6 }}>
          Job scheduling, sorted by geography
        </div>
      </div>

      <div className="card">
        <h1 className="screen-title" style={{ marginBottom: 18 }}>Set a new password</h1>
        <ResetPasswordForm />
      </div>

      <Footer />
      <p className="version">v1.0.2-stable</p>
    </main>
  );
}
