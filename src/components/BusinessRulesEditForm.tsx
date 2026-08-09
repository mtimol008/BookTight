"use client";

import { useState, useActionState, type FormEvent } from "react";
import { updateBusinessRules, type AccountFormState } from "@/app/account/actions";
import { distanceKmToUnit, type DistanceUnit } from "@/lib/format";
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
  const initialDistanceUnit = profile.distance_unit ?? "km";
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(initialDistanceUnit);
  const [maxTravelRange, setMaxTravelRange] = useState(
    distanceKmToUnit(profile.max_travel_range_km, initialDistanceUnit).toFixed(1)
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
        <label className="field-label" htmlFor="business-rules-distance-unit">
          Distance units
        </label>
        <select
          id="business-rules-distance-unit"
          className="input"
          name="distanceUnit"
          value={distanceUnit}
          onChange={(e) => {
            const nextUnit = e.target.value as DistanceUnit;
            setDistanceUnit(nextUnit);
            const numericValue = Number(maxTravelRange);
            if (Number.isFinite(numericValue)) {
              const currentKm =
                distanceUnit === "mi" ? numericValue / 0.621371 : numericValue;
              setMaxTravelRange(distanceKmToUnit(currentKm, nextUnit).toFixed(1));
            }
          }}
        >
          <option value="km">Kilometers (km)</option>
          <option value="mi">Miles (mi)</option>
        </select>
        <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
          Choose the unit you'd like distances to be displayed in.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="business-rules-max-travel">
          Max travel range ({distanceUnit})
        </label>
        <input
          id="business-rules-max-travel"
          className="input"
          type="number"
          name="maxTravelRangeKm"
          required
          min={1}
          step="0.1"
          value={maxTravelRange}
          onChange={(e) => setMaxTravelRange(e.target.value)}
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
