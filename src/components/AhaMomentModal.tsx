"use client";

import type { AhaMomentPayload } from "@/app/actions";
import { formatDistance, formatSuggestionDate, type DistanceUnit } from "@/lib/format";

/**
 * The one-time, lifetime celebration for a day's first real 2+-job route.
 * Shows the actual computed route — the order that means the least
 * driving between these real stops — and nothing fabricated: no "you
 * saved X miles" claim, since a day's first-ever pairing has no prior,
 * unoptimized baseline to compare against.
 */
export function AhaMomentModal({
  payload,
  distanceUnit,
  onDismiss,
}: {
  payload: AhaMomentPayload;
  distanceUnit: DistanceUnit;
  onDismiss: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="screen-title" style={{ marginBottom: 4 }}>
          Two jobs, one trip
        </div>
        <p className="note" style={{ marginBottom: 14 }}>
          Here&apos;s the route Booktight worked out for{" "}
          {formatSuggestionDate(payload.date)} — the order that means the
          least driving between them.
        </p>

        <div className="timeline">
          <div className="stop">
            <span className="stop-dot stop-dot--endpoint" />
            <div className="stop-body">
              <div className="stop-endpoint-label">Start</div>
              <div className="stop-name">Home</div>
            </div>
          </div>

          {payload.stops.map((stop, index) => (
            <div className="stop" key={index}>
              <span className="stop-dot">{index + 1}</span>
              <div className="stop-body">
                <div className="stop-name">{stop.customerName}</div>
                <div className="stop-address">{stop.address}</div>
              </div>
            </div>
          ))}

          <div className="stop">
            <span className="stop-dot stop-dot--endpoint" />
            <div className="stop-body">
              <div className="stop-endpoint-label">End</div>
              <div className="stop-name">Home</div>
            </div>
          </div>
        </div>

        {payload.totalDistanceKm !== null && (
          <div className="day-distance" style={{ marginTop: 10 }}>
            {formatDistance(payload.totalDistanceKm, distanceUnit)} round trip
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary btn--block"
          style={{ marginTop: 18 }}
          onClick={onDismiss}
        >
          Nice
        </button>
      </div>
    </div>
  );
}
