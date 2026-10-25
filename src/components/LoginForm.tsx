"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { signIn, type LoginState } from "@/app/login/actions";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

const initialState: LoginState = {};

// No Turnstile widget here, unlike SignUpForm/ForgotPasswordForm —
// see the matching comment in login/actions.ts for why.
export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction}>
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

      {state.error && <p className="error-text">{state.error}</p>}

      <button type="submit" className="btn btn--primary btn--block" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
