import { WEEKDAY_KEYS, WEEKDAY_LABELS, type Weekday } from "@/lib/scheduling";

export type WorkingHoursState = Record<
  Weekday,
  { enabled: boolean; start: string; end: string }
>;

/**
 * Per-day working hours editor: one row per weekday, each with an on/off
 * checkbox and a start/end time pair. Field names (`${day}-enabled`,
 * `${day}-start`, `${day}-end`) are read by validateBusinessRules — FormData
 * can't nest, so this flat naming convention is the contract between this
 * component and both server actions that consume it (onboarding, Account).
 */
export function WorkingHoursFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: WorkingHoursState;
  onChange: (next: WorkingHoursState) => void;
}) {
  function updateDay(day: Weekday, patch: Partial<WorkingHoursState[Weekday]>) {
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  }

  return (
    <div className="field">
      <span className="field-label">Working hours</span>
      <div className="working-hours-grid">
        {WEEKDAY_KEYS.map((day) => {
          const dayHours = value[day];
          const startId = `${idPrefix}-${day}-start`;
          const endId = `${idPrefix}-${day}-end`;
          return (
            <div key={day} className="working-hours-row">
              <label className="working-hours-day">
                <input
                  type="checkbox"
                  name={`${day}-enabled`}
                  checked={dayHours.enabled}
                  onChange={(e) => updateDay(day, { enabled: e.target.checked })}
                />
                {WEEKDAY_LABELS[day]}
              </label>
              <div className="btn-row">
                <input
                  id={startId}
                  aria-label={`${WEEKDAY_LABELS[day]} start time`}
                  className="input input--time"
                  type="time"
                  name={`${day}-start`}
                  required={dayHours.enabled}
                  disabled={!dayHours.enabled}
                  value={dayHours.start}
                  onChange={(e) => updateDay(day, { start: e.target.value })}
                />
                <input
                  id={endId}
                  aria-label={`${WEEKDAY_LABELS[day]} end time`}
                  className="input input--time"
                  type="time"
                  name={`${day}-end`}
                  required={dayHours.enabled}
                  disabled={!dayHours.enabled}
                  value={dayHours.end}
                  onChange={(e) => updateDay(day, { end: e.target.value })}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="note" style={{ marginTop: 6, marginBottom: 0 }}>
        Turn off any day you don't work. Used when there's no booked job to
        anchor a suggested time against.
      </p>
    </div>
  );
}
