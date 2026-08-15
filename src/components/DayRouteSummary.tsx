import Link from "next/link";
import { formatDistance, formatSuggestionDate, type DistanceUnit } from "@/lib/format";
import type { DayReviewStatus, JobRecord } from "@/lib/jobs";
import { formatMinutesAsClock, parseTimeToMinutes, type TimeSlotType } from "@/lib/scheduling";

const TIME_SLOT_LABELS: Record<TimeSlotType, string> = {
  none: "Flexible",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
  specific: "Specific",
};

function jobTimeLabel(job: JobRecord): string {
  return job.time_slot_type === "specific"
    ? job.specific_time
      ? formatMinutesAsClock(parseTimeToMinutes(job.specific_time))
      : ""
    : TIME_SLOT_LABELS[job.time_slot_type as TimeSlotType] ?? job.time_slot_type;
}

function formatDistanceForUnit(distanceKm: number | null, unit: DistanceUnit): string {
  return formatDistance(distanceKm, unit);
}

export interface DayRouteSummaryStop {
  job: JobRecord;
  distanceFromPreviousKm: number | null;
  cumulativeDistanceKm: number | null;
}

/**
 * A read-only rendering of one day's route — reuses the same `.timeline`/
 * `.stop-*` CSS classes as JobsTable's This Week view for visual parity,
 * but is a fresh, independent component rather than sharing JSX with it.
 * JobsTable's timeline is tightly coupled to its inline-edit state (three
 * render branches per stop); extracting a shared piece from that would
 * mean touching a stable, heavily-iterated component for no functional
 * gain, since Calendar has no need for any of that — just the route.
 */
export function DayRouteSummary({
  date,
  stops,
  returnHomeKm,
  totalDistanceKm,
  distanceUnit,
  reviewStatus,
}: {
  date: string;
  stops: DayRouteSummaryStop[];
  returnHomeKm: number | null;
  totalDistanceKm: number | null;
  distanceUnit: DistanceUnit;
  reviewStatus: DayReviewStatus;
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="day-card-head">
        <div>
          <span className="day-title">{formatSuggestionDate(date)}</span>{" "}
          <span className="day-stops">
            {stops.length} stop{stops.length === 1 ? "" : "s"}
          </span>
        </div>
        {reviewStatus === "needs-review" && (
          <Link href={`/review/${date}`} className="btn btn--warning btn--sm btn--pill">
            Review
          </Link>
        )}
      </div>
      {totalDistanceKm !== null && stops.length > 0 && (
        <div className="day-distance">
          {formatDistanceForUnit(totalDistanceKm, distanceUnit)} round trip
        </div>
      )}

      {stops.length === 0 ? (
        <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
          Nothing booked this day.
        </p>
      ) : (
        <div className="timeline">
          <div className="stop">
            <span className="stop-dot stop-dot--endpoint" />
            <div className="stop-body">
              <div className="stop-endpoint-label">Start</div>
              <div className="stop-name">Home</div>
            </div>
          </div>

          {stops.map((stop, index) => {
            const isCompleted = stop.job.status === "completed";
            return (
              <div key={stop.job.id} className={`stop${isCompleted ? " is-done" : ""}`}>
                <span className="stop-dot">{isCompleted ? "✓" : index + 1}</span>
                <div className="stop-body">
                  <div className="stop-time">{jobTimeLabel(stop.job)}</div>
                  <div className="stop-name">{stop.job.customer_name}</div>
                  <div className="stop-address">{stop.job.address}</div>
                </div>
                <div className="stop-leg">
                  {formatDistanceForUnit(stop.distanceFromPreviousKm, distanceUnit)}
                </div>
              </div>
            );
          })}

          <div className="stop">
            <span className="stop-dot stop-dot--endpoint" />
            <div className="stop-body">
              <div className="stop-endpoint-label">End</div>
              <div className="stop-name">Home</div>
            </div>
            <div className="stop-leg">
              {formatDistanceForUnit(returnHomeKm, distanceUnit)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
