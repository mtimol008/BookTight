"use client";

import dynamic from "next/dynamic";
import type { DayPlan } from "@/components/JobsTable";

const JobsTable = dynamic<{ days: DayPlan[] }>(
  () => import("@/components/JobsTable").then((mod) => mod.JobsTable),
  {
    ssr: false,
    loading: () => <div>Loading jobs...</div>,
  }
);

export default function JobsTableClient({ days }: { days: DayPlan[] }) {
  return <JobsTable days={days} />;
}
