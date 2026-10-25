"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { signIn, type LoginState } from "@/app/login/actions";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { Turnstile } from "@/components/Turnstile";
import { isTurnstileDisabled } from "@/lib/turnstileConfig";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileDisabled = isTurnstileDisabled();

  return (
    <form action={formAction}>
      <input type="hidden" name="turnstileToken" value={turnstileToken ?? ""} />
      <div className="field">
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          name="email"
          placeholder="you@yourbusiness.com"
          required
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <div className="input-wrap">
          <input
            id="password"
            className="input"
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="••••••••"
            required
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
        <p style={{ marginTop: 8, marginBottom: 0 }}>
          <Link href="/forgot-password" className="muted" style={{ fontSize: 13 }}>
            Forgot password?
          </Link>
        </p>
      </div>

      {!turnstileDisabled && <Turnstile onToken={setTurnstileToken} />}

      {state.error && <p className="error-text">{state.error}</p>}

      <button
        type="submit"
        className="btn btn--primary btn--block"
        disabled={isPending || (!turnstileDisabled && !turnstileToken)}
      >
        {isPending ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
