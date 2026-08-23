"use client";

import { useState, useActionState } from "react";
import { signIn, type LoginState } from "@/app/login/actions";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

const initialState: LoginState = {};

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
      </div>

      {state.error && <p className="error-text">{state.error}</p>}

      <button type="submit" className="btn btn--primary btn--block" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
