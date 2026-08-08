-- Booktight: per-user scheduling preferences + business name
-- Run in the Supabase SQL Editor.
--
-- Turns three of the fixed constants in src/lib/scheduling.ts into real
-- per-account settings: working hours (used when there's no booked job to
-- anchor a suggested time against), max travel range (how far an added
-- job's extra driving can go before it's not "recommended"), and max jobs
-- per day (a new cap — a day already at capacity won't be suggested, and
-- picking it manually warns first). Defaults match today's hardcoded
-- values exactly, so no existing account's suggestions change until they
-- actually visit Account and adjust something.
--
-- The trigger that creates a profile row on signup (handle_new_user() in
-- 20260804220000_add_auth.sql) inserts named columns only, so it needs no
-- changes here — these new columns are simply left to their defaults.

alter table public.profiles
  add column if not exists business_name text,
  add column if not exists working_hours_start time not null default '08:00',
  add column if not exists working_hours_end time not null default '18:00',
  add column if not exists max_travel_range_km integer not null default 65,
  add column if not exists max_jobs_per_day integer;
  -- max_jobs_per_day stays nullable: null means "no cap", matching
  -- today's actual behavior. A non-null default would retroactively warn
  -- on schedules nobody ever opted into a limit for.

alter table public.profiles add constraint profiles_working_hours_check
  check (working_hours_end > working_hours_start);

alter table public.profiles add constraint profiles_max_travel_range_check
  check (max_travel_range_km > 0);

alter table public.profiles add constraint profiles_max_jobs_per_day_check
  check (max_jobs_per_day is null or max_jobs_per_day > 0);
