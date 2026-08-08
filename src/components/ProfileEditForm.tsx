"use client";

import { useRef, useState, useActionState } from "react";
import { updateProfileBasics, type AccountFormState } from "@/app/account/actions";
import { getAddressSuggestions } from "@/app/actions";
import { PinIcon } from "@/components/icons";
import type { AddressSuggestion } from "@/lib/geocoding";
import type { ProfileRecord } from "@/lib/profiles";

const initialState: AccountFormState = {};

export function ProfileEditForm({ profile }: { profile: ProfileRecord }) {
  const [state, formAction, isPending] = useActionState(updateProfileBasics, initialState);

  const [homeAddress, setHomeAddress] = useState(profile.home_address);
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
        <label className="field-label" htmlFor="profile-name">
          Full name
        </label>
        <input
          id="profile-name"
          className="input"
          type="text"
          name="fullName"
          required
          defaultValue={profile.full_name ?? ""}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="profile-business-name">
          Business name
        </label>
        <input
          id="profile-business-name"
          className="input"
          type="text"
          name="businessName"
          defaultValue={profile.business_name ?? ""}
          placeholder="Optional"
        />
      </div>

      <div className="field" style={{ position: "relative" }}>
        <label className="field-label" htmlFor="profile-address">
          Home address
        </label>
        <input
          id="profile-address"
          className="input"
          type="text"
          name="homeAddress"
          required
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

      {state.error && <p className="error-text">{state.error}</p>}

      <button type="submit" className="btn btn--primary btn--block" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
