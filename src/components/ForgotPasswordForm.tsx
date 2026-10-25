"use client";

import { useActionState, useState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "@/app/forgot-password/actions";
import { Turnstile } from "@/components/Turnstile";
import { isTurnstileDisabled } from "@/lib/turnstileConfig";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialState);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileDisabled = isTurnstileDisabled();

  return (
    <form action={formAction}>
      <input type="hidden" name="turnstileToken" value={turnstileToken ?? ""} />
      <div className="field">
        <label className="field-label" htmlFor="forgot-password-email">
          Email
        </label>
        <input
          id="forgot-password-email"
          className="input"
          type="email"
          name="email"
          placeholder="you@yourbusiness.com"
          required
        />
      </div>

      {!turnstileDisabled && <Turnstile onToken={setTurnstileToken} />}

      {state.error && <p className="error-text">{state.error}</p>}
      {state.message && <p className="success-text">{state.message}</p>}

      <button
        type="submit"
        className="btn btn--primary btn--block"
        disabled={isPending || (!turnstileDisabled && !turnstileToken)}
        style={{ marginTop: 16 }}
      >
        {isPending ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
