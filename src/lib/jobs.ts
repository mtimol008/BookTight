import { getTodayDateString } from "./week";
import { createClient } from "./supabase/server";

export type JobStatus = "scheduled" | "completed" | "cancelled";

export interface JobRecord {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  date: string;
  time_slot_type: string;
  specific_time: string | null;
  customer_name: string;
  description: string | null;
  /** null = use the flat assumed default. */
  duration_minutes: number | null;
  /** null = use the computed order. Only meaningful relative to siblings
   *  sharing this job's (date, time_slot_type). */
  manual_position: number | null;
  status: JobStatus;
  created_at: string;
}

/**
 * The week's jobs, excluding cancelled ones.
 *
 * That exclusion does double duty: cancelled work disappears from the
 * table, AND it stops occupying space in the route, because the scheduling
 * actions all read their existing jobs through this same function.
 */
export async function getJobsForWeek(
  startDate: string,
  endDate: string
): Promise<JobRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .neq("status", "cancelled")
    .order("date", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch jobs: ${error.message}`);
  }

  return data ?? [];
}

/** One job by id — used to compare against an incoming edit's date/time
 *  before deciding whether a manual_position override still applies. */
export async function getJobById(id: string): Promise<JobRecord | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch job ${id}: ${error.message}`);
  }

  return data;
}

/** Jobs on one date still awaiting review. */
export async function getScheduledJobsForDate(date: string): Promise<JobRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("date", date)
    .eq("status", "scheduled");

  if (error) {
    throw new Error(`Failed to fetch jobs for ${date}: ${error.message}`);
  }

  return data ?? [];
}

export interface UnreviewedSummary {
  date: string;
  jobCount: number;
}

/**
 * The oldest past day that still has jobs sitting at `scheduled`, i.e. a
 * day that came and went without anyone saying what happened on it.
 * Returns null when there's nothing to review.
 *
 * Always the OLDEST such day, so clearing one simply reveals the next and
 * a backlog works through itself one day at a time.
 */
export async function getUnreviewedSummary(): Promise<UnreviewedSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select("date")
    .eq("status", "scheduled")
    .lt("date", getTodayDateString())
    .order("date", { ascending: true });

  if (error) {
    throw new Error(`Failed to check for unreviewed jobs: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return null;
  }

  const oldestDate = rows[0].date as string;
  return {
    date: oldestDate,
    jobCount: rows.filter((row) => row.date === oldestDate).length,
  };
}

/**
 * Persists a manual reorder: each job's position within its group, as an
 * index. The Supabase JS client can't set different values per row in one
 * call, so this is one update per job — fine at the scale a single day's
 * time-of-day group actually reaches.
 */
export async function setManualPositions(
  positions: { id: string; position: number }[]
): Promise<void> {
  const supabase = await createClient();

  const results = await Promise.all(
    positions.map(({ id, position }) =>
      supabase.from("jobs").update({ manual_position: position }).eq("id", id)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    throw new Error(`Failed to save the new order: ${failed.error.message}`);
  }
}

export async function setJobStatuses(
  ids: string[],
  status: JobStatus
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const supabase = await createClient();

  const { error } = await supabase.from("jobs").update({ status }).in("id", ids);

  if (error) {
    throw new Error(`Failed to update job status: ${error.message}`);
  }
}

export interface NewJobInput {
  address: string;
  latitude: number;
  longitude: number;
  date: string;
  time_slot_type: string;
  specific_time: string | null;
  customer_name: string;
  description: string;
  duration_minutes: number | null;
}

export async function insertJob(job: NewJobInput): Promise<JobRecord> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You must be logged in to add a job.");
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({ ...job, user_id: user.id })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save job: ${error.message}`);
  }

  return data;
}

export interface UpdateJobInput extends NewJobInput {
  /** Present-and-null actively clears any override (the reset rule when
   *  date/time_slot_type changes); omitted leaves the column untouched. */
  manual_position?: number | null;
}

export async function updateJob(
  id: string,
  updates: UpdateJobInput
): Promise<JobRecord> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update job: ${error.message}`);
  }

  return data;
}

export async function deleteJob(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("jobs").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete job: ${error.message}`);
  }
}
