"use client";

import dynamic from "next/dynamic";
import type { DayPlan } from "@/components/JobsTable";
import type { DistanceUnit } from "@/lib/format";

const JobsTable = dynamic<{ days: DayPlan[]; distanceUnit: DistanceUnit }>(
  () => import("@/components/JobsTable").then((mod) => mod.JobsTable),
  {
    ssr: false,
    loading: () => (
      <div className="route-loading" aria-live="polite" aria-busy="true">
        <span className="route-loading-spinner" />
      </div>
    ),
  }
);

export default function JobsTableClient({
  days,
  distanceUnit,
}: {
  days: DayPlan[];
  distanceUnit: "km" | "mi";
}) {
  return <JobsTable days={days} distanceUnit={distanceUnit} />;
}
