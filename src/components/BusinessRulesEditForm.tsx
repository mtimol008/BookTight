"use client";

import { useState, useActionState, type FormEvent } from "react";
import { updateBusinessRules, type AccountFormState } from "@/app/account/actions";
import type { ProfileRecord } from "@/lib/profiles";

const initialState: AccountFormState = {};

export function BusinessRulesEditForm({ profile }: { profile: ProfileRecord }) {
  const [state, formAction, isPending] = useActionState(updateBusinessRules, initialState);

  const [workingHoursStart, setWorkingHoursStart] = useState(
    profile.working_hours_start.slice(0, 5)
  );
  const [workingHoursEnd, setWorkingHoursEnd] = useState(
    profile.working_hours_end.slice(0, 5)
  );
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (workingHoursEnd <= workingHoursStart) {
      event.preventDefault();
      setClientError("Working hours end must be after the start.");
      return;
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit}>
      <div className="field">
        <span className="field-label">Working hours</span>
        <div className="btn-row">
          <input
            className="input input--time"
            type="time"
            name="workingHoursStart"
            required
            value={workingHoursStart}
            onChange={(e) => setWorkingHoursStart(e.target.value)}
          />
          <input
            className="input input--time"
            type="time"
            name="workingHoursEnd"
            required
            value={workingHoursEnd}
            onChange={(e) => setWorkingHoursEnd(e.target.value)}
          />
        </div>
        <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
          Used when there's no booked job to anchor a suggested time against.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="business-rules-max-travel">
          Max travel range (km)
        </label>
        <input
          id="business-rules-max-travel"
          className="input"
          type="number"
          name="maxTravelRangeKm"
          required
          min={1}
          step="1"
          defaultValue={profile.max_travel_range_km}
        />
        <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
          How far a job can add to a day's driving before it's no longer
          recommended without a good reason.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="business-rules-max-jobs">
          Max jobs per day
        </label>
        <input
          id="business-rules-max-jobs"
          className="input"
          type="number"
          name="maxJobsPerDay"
          min={1}
          step="1"
          placeholder="No limit"
          defaultValue={profile.max_jobs_per_day ?? ""}
        />
        <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
          Leave blank for no cap. A day already at this many jobs won't be
          suggested, and picking it manually warns first.
        </p>
      </div>

      {(clientError || state.error) && (
        <p className="error-text">{clientError ?? state.error}</p>
      )}

      <button type="submit" className="btn btn--primary btn--block" disabled={isPending}>
        {isPending ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
