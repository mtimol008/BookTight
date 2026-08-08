-- Booktight: job status + end-of-day review
-- Run in the Supabase SQL Editor BEFORE loading the updated app — the new
-- queries filter on `status`, so they error against the old schema rather
-- than degrading quietly.
--
-- Adds a lifecycle to jobs so the app can record what actually happened:
--   scheduled  booked, not yet reviewed (the default, and what every
--              existing row correctly becomes)
--   completed  the work was done
--   cancelled  the work isn't happening; hidden from the active view
--
-- There is deliberately no separate "reviewed" flag. A past day counts as
-- unreviewed precisely when it still holds `scheduled` jobs, so completing,
-- cancelling or rescheduling them clears the day on its own and no
-- bookkeeping column can ever disagree with the jobs it describes.

alter table public.jobs
  add column if not exists status text not null default 'scheduled';

alter table public.jobs add constraint jobs_status_check
  check (status in ('scheduled', 'completed', 'cancelled'));

-- Serves the "oldest past day still holding scheduled jobs" lookup that
-- runs on every page load.
create index if not exists jobs_status_date_idx
  on public.jobs (user_id, status, date);
