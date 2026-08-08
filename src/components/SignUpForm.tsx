"use client";

import { useRef, useState, useActionState } from "react";
import { signUp, type SignUpState } from "@/app/signup/actions";
import { getAddressSuggestions } from "@/app/actions";
import { PinIcon } from "@/components/icons";
import type { AddressSuggestion } from "@/lib/geocoding";

const initialState: SignUpState = {};

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUp, initialState);

  const [homeAddress, setHomeAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleAddressChange(value: string) {
    setHomeAddress(value);
    setShowAddressSuggestions(true);

    if (addressDebounceRef.current) {
      clearTimeout(addressDebounceRef.current);
    }

    if (value.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }

    addressDebounceRef.current = setTimeout(() => {
      getAddressSuggestions(value)
        .then(setAddressSuggestions)
        .catch(() => setAddressSuggestions([]));
    }, 300);
  }

  function handleSelectAddressSuggestion(suggestion: AddressSuggestion) {
    setHomeAddress(suggestion.placeName);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }

  return (
    <form action={formAction}>
      <div className="field">
        <label className="field-label" htmlFor="signup-name">
          Full name
        </label>
        <input
          id="signup-name"
          className="input"
          type="text"
          name="fullName"
          placeholder="Alex Thompson"
          required
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="signup-business-name">
          Business name
        </label>
        <input
          id="signup-business-name"
          className="input"
          type="text"
          name="businessName"
          placeholder="Optional"
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="signup-email">
          Email
        </label>
        <input
          id="signup-email"
          className="input"
          type="email"
          name="email"
          placeholder="you@yourbusiness.com"
          required
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="signup-password">
          Password
        </label>
        <div className="input-wrap">
          <input
            id="signup-password"
            className="input"
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="At least 6 characters"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="input-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="signup-confirm-password">
          Confirm password
        </label>
        <div className="input-wrap">
          <input
            id="signup-confirm-password"
            className="input"
            type={showConfirmPassword ? "text" : "password"}
            name="confirmPassword"
            placeholder="Repeat your password"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button
            type="button"
            className="input-toggle"
            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            onClick={() => setShowConfirmPassword((current) => !current)}
          >
            {showConfirmPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="signup-address">
          Home address
        </label>
        <input
          id="signup-address"
          className="input"
          type="text"
          name="homeAddress"
          required
          placeholder="e.g. 123 Main St, Manchester"
          value={homeAddress}
          onChange={(e) => handleAddressChange(e.target.value)}
          onFocus={() => setShowAddressSuggestions(true)}
          onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 150)}
          autoComplete="off"
        />
        <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
          Every route starts and ends here.
        </p>
        {showAddressSuggestions && addressSuggestions.length > 0 && (
          <ul className="autocomplete">
            {addressSuggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="autocomplete-item"
                  onClick={() => handleSelectAddressSuggestion(s)}
                >
                  <PinIcon />
                  {s.placeName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmPassword && password !== confirmPassword && (
        <p className="error-text">Passwords do not match.</p>
      )}
      {state.error && <p className="error-text">{state.error}</p>}
      {state.message && (
        <p className="error-text" style={{ color: "var(--success)" }}>
          {state.message}
        </p>
      )}

      <button type="submit" className="btn btn--primary btn--block" disabled={isPending}>
        {isPending ? "Creating account..." : "Create Account"}
      </button>
    </form>
  );
}
