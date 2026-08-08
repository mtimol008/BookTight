-- Booktight: real per-job duration
-- Run in the Supabase SQL Editor.
--
-- The scheduling engine used one flat assumed duration for every job,
-- which let several quick, geographically-close jobs all land in the same
-- slot without ever exhausting the window a longer job would have. This
-- makes duration a real per-job value, used instead of the flat default
-- wherever it's set.

alter table public.jobs add column if not exists duration_minutes integer;

-- Nullable — null means "use the flat default", the same convention
-- max_jobs_per_day already uses for "no cap".
alter table public.jobs add constraint jobs_duration_minutes_check
  check (duration_minutes is null or duration_minutes > 0);
