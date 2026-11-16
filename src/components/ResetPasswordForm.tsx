"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { MIN_PASSWORD_LENGTH, passwordTooShortMessage } from "@/lib/password";

type Status = "checking" | "ready" | "invalid" | "saved";

/**
 * The page Supabase's reset-password email links to. The recovery session
 * only ever exists client-side (it arrives as tokens in the URL fragment,
 * which the server never sees), so this form talks to Supabase directly
 * rather than through a server action — there's no cookie-sync delay to
 * work around that way.
 *
 * The recovery link uses the legacy hash-fragment format
 * (#access_token=...&refresh_token=...&type=recovery), not a PKCE `?code=`
 * — and the shared browser client (src/lib/supabase/client.ts) can't be
 * switched to implicit flow to auto-detect that (@supabase/ssr's
 * createBrowserClient hard-codes flowType: "pkce" regardless of what's
 * passed in). So this reads the fragment itself and calls setSession()
 * directly, rather than relying on the client's own URL detection.
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
    async function processRecoveryLink() {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (!accessToken || !refreshToken || type !== "recovery") {
        // No recovery tokens at all (direct visit), or Supabase's own
        // error fragment for an expired/already-used link
        // (#error=...&error_code=otp_expired&...).
        setStatus("invalid");
        return;
      }

      const supabase = createClient();
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      // Clear the tokens from the address bar either way — they're
      // single-use, and leaving them visible/bookmarkable serves no
      // purpose once they've been consumed.
      history.replaceState(null, "", window.location.pathname);
      setStatus(setSessionError ? "invalid" : "ready");
    }

    processRecoveryLink();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(passwordTooShortMessage());
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
            minLength={MIN_PASSWORD_LENGTH}
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
          minLength={MIN_PASSWORD_LENGTH}
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
