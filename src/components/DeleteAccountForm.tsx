"use client";

import { useState, useActionState } from "react";
import {
  deleteAccount,
  type DeleteAccountFormState,
} from "@/app/account/delete/actions";

const initialState: DeleteAccountFormState = {};

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, formAction, isPending] = useActionState(deleteAccount, initialState);
  const [typedEmail, setTypedEmail] = useState("");

  const matches = typedEmail.trim().toLowerCase() === email.toLowerCase();

  return (
    <form action={formAction}>
      <p style={{ marginTop: 0 }}>
        This permanently deletes your Booktight account, including every
        job you've booked. There's no undo.
      </p>

      <div className="field">
        <label className="field-label" htmlFor="delete-confirm-email">
          Type your email ({email}) to confirm
        </label>
        <input
          id="delete-confirm-email"
          className="input"
          type="email"
          name="confirmedEmail"
          required
          value={typedEmail}
          onChange={(e) => setTypedEmail(e.target.value)}
          autoComplete="off"
        />
      </div>

      {state.error && <p className="error-text">{state.error}</p>}

      <button
        type="submit"
        className="btn btn--block"
        style={{ background: "var(--warning)", color: "#fff" }}
        disabled={isPending || !matches}
      >
        {isPending ? "Deleting..." : "Permanently Delete My Account"}
      </button>
    </form>
  );
}
