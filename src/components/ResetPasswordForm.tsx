"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

type Status = "checking" | "ready" | "invalid" | "saved";

/**
 * The page Supabase's reset-password email links to. The recovery session
 * only ever exists client-side (it arrives as tokens in the URL fragment,
 * which the server never sees), so this form talks to Supabase directly
 * rather than through a server action — there's no cookie-sync delay to
 * work around that way.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // PASSWORD_RECOVERY fires once the SDK finishes processing the
    // recovery tokens from the URL — more reliable than a one-shot
    // getSession() check, since that processing happens asynchronously
    // right after the page loads.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setStatus("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus("ready");
    });

    // No recovery event within a few seconds means there was no valid
    // token in the URL to begin with (direct visit, expired link, etc.).
    const timeout = setTimeout(() => {
      setStatus((current) => (current === "checking" ? "invalid" : current));
    }, 3000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setStatus("saved");
    setTimeout(() => router.push("/login"), 1500);
  }

  if (status === "checking") {
    return <p className="note">Checking your reset link...</p>;
  }

  if (status === "invalid") {
    return (
      <>
        <p className="error-text">This link is invalid or has expired.</p>
        <Link
          href="/forgot-password"
          className="btn btn--primary btn--block"
          style={{ marginTop: 12 }}
        >
          Request a new link
        </Link>
      </>
    );
  }

  if (status === "saved") {
    return <p className="success-text">Password updated. Redirecting to sign in...</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label className="field-label" htmlFor="reset-password-new">
          New password
        </label>
        <div className="input-wrap">
          <input
            id="reset-password-new"
            className="input"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="input-toggle"
            style={{ display: "flex", alignItems: "center" }}
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="reset-password-confirm">
          Confirm new password
        </label>
        <input
          id="reset-password-confirm"
          className="input"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && <p className="error-text">{error}</p>}

      <button type="submit" className="btn btn--primary btn--block" disabled={isSaving}>
        {isSaving ? "Saving..." : "Set new password"}
      </button>
    </form>
  );
}
