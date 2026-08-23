"use client";

/**
 * Hours + minutes entry for a job's duration, natural to type instead of a
 * raw minutes count. Keeps the same external shape every caller already
 * used (a single "total minutes" string, blank meaning "use the flat
 * default") — this just splits/recombines it for display, so callers' own
 * save/debounce/validation logic around durationMinutesInput needs no
 * changes at all.
 */
export function DurationFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (totalMinutes: string) => void;
}) {
  const totalMinutes = value.trim() ? Number(value) : null;
  const hours =
    totalMinutes !== null && Number.isFinite(totalMinutes)
      ? Math.floor(totalMinutes / 60)
      : null;
  const minutes =
    totalMinutes !== null && Number.isFinite(totalMinutes) ? totalMinutes % 60 : null;

  function update(nextHours: number | null, nextMinutes: number | null) {
    if (nextHours === null && nextMinutes === null) {
      onChange("");
      return;
    }
    const total = (nextHours ?? 0) * 60 + (nextMinutes ?? 0);
    onChange(total > 0 ? String(total) : "");
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        className="input"
        type="number"
        min={0}
        step="1"
        placeholder="0"
        style={{ width: 72 }}
        value={hours ?? ""}
        onChange={(e) =>
          update(e.target.value === "" ? null : Number(e.target.value), minutes)
        }
        aria-label="Hours"
      />
      <span className="muted" style={{ fontSize: 13 }}>
        h
      </span>
      <input
        className="input"
        type="number"
        min={0}
        max={59}
        step="1"
        placeholder="0"
        style={{ width: 72 }}
        value={minutes ?? ""}
        onChange={(e) =>
          update(hours, e.target.value === "" ? null : Number(e.target.value))
        }
        aria-label="Minutes"
      />
      <span className="muted" style={{ fontSize: 13 }}>
        m
      </span>
    </div>
  );
}
