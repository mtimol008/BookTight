-- Booktight: per-job urgency, and a per-user buffer between jobs
-- Run in the Supabase SQL Editor.
--
-- Both default to the value that makes the scheduling engine behave
-- exactly as it does today — 'normal' urgency and a 0-minute buffer are
-- no-ops in the ranking/gap logic, so this migration changes nothing for
-- any existing account or any job already booked. default 'normal' / 0
-- backfills every existing row automatically, same as the job_status
-- migration before it.

alter table public.jobs
  add column if not exists urgency text not null default 'normal';

alter table public.jobs add constraint jobs_urgency_check
  check (urgency in ('urgent', 'normal', 'whenever'));

-- Extra minutes added on top of the existing travel-time estimate between
-- jobs — 0 means "no change from today's behaviour". Capped at 2 hours;
-- anything longer isn't a buffer, it's a day with very few jobs in it.
alter table public.profiles
  add column if not exists buffer_minutes integer not null default 0;

alter table public.profiles add constraint profiles_buffer_minutes_check
  check (buffer_minutes >= 0 and buffer_minutes <= 120);
