"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/login/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

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
        <input
          id="password"
          className="input"
          type="password"
          name="password"
          placeholder="••••••••"
          required
        />
      </div>

      {state.error && <p className="error-text">{state.error}</p>}

      <button type="submit" className="btn btn--primary btn--block" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
