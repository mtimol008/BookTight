"use client";

import dynamic from "next/dynamic";
import type { DayPlan } from "@/components/JobsTable";
import { SkeletonDayCard } from "@/components/Skeleton";
import type { DistanceUnit } from "@/lib/format";

const JobsTable = dynamic<{ days: DayPlan[]; distanceUnit: DistanceUnit }>(
  () => import("@/components/JobsTable").then((mod) => mod.JobsTable),
  {
    ssr: false,
    // The route's own loading.tsx already covers the server data fetch —
    // this is just the (usually near-instant) client code-split chunk
    // loading, shown with the same skeleton shape for consistency rather
    // than a plain spinner.
    loading: () => <SkeletonDayCard rows={2} />,
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
