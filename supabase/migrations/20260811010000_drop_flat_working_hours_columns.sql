-- Booktight: drop the old flat working-hours columns
-- Run in the Supabase SQL Editor.
--
-- Step 2 of 2 — run this only after confirming
-- 20260811000000_per_day_working_hours.sql's backfill looks right (spot
-- check a row's working_hours column). This drops working_hours_start and
-- working_hours_end for good.

alter table public.profiles drop constraint if exists profiles_working_hours_check;

alter table public.profiles
  drop column if exists working_hours_start,
  drop column if exists working_hours_end;
