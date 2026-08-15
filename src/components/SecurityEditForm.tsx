"use client";

import { useState, useActionState, type FormEvent } from "react";
import {
  updateSecurity,
  type SecurityFormState,
} from "@/app/account/edit/security/actions";

const initialState: SecurityFormState = {};

export function SecurityEditForm({ email }: { email: string }) {
  const [state, formAction, isPending] = useActionState(updateSecurity, initialState);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  // The server re-checks current password against the real account (a
  // client check can't do that), but catching an EMPTY current password
  // here means that common case never round-trips first.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (newPassword && !currentPassword) {
      event.preventDefault();
      setClientError("Enter your current password to set a new one.");
      return;
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit}>
      <div className="field">
        <label className="field-label" htmlFor="security-email">
          Email
        </label>
        <input
          id="security-email"
          className="input"
          type="email"
          name="email"
          required
          defaultValue={email}
        />
        <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
          Changing this sends a confirmation link to the new address — the
          change won't take effect until you click it.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="security-current-password">
          Current password
        </label>
        <input
          id="security-current-password"
          className="input"
          type="password"
          name="currentPassword"
          placeholder="Required only to set a new password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="security-new-password">
          New password
        </label>
        <input
          id="security-new-password"
          className="input"
          type="password"
          name="newPassword"
          placeholder="Leave blank to keep your current password"
          autoComplete="new-password"
          minLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="security-confirm-password">
          Confirm new password
        </label>
        <input
          id="security-confirm-password"
          className="input"
          type="password"
          name="confirmPassword"
          placeholder="Repeat the new password"
          autoComplete="new-password"
          minLength={6}
        />
      </div>

      {(clientError || state.error) && (
        <p className="error-text">{clientError ?? state.error}</p>
      )}
      {state.message && <p className="success-text">{state.message}</p>}

      <button type="submit" className="btn btn--primary btn--block" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
