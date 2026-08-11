-- Booktight: per-day working hours
-- Run in the Supabase SQL Editor.
--
-- Replaces the single working_hours_start/working_hours_end pair (applied
-- to every day of the week) with a per-day jsonb column: each day can be
-- turned on/off and given its own start/end. suggestBestDay in
-- src/lib/scheduling.ts now looks up that day's own hours instead of one
-- flat window for the whole week.
--
-- Existing accounts today effectively work all 7 days (there's no on/off
-- concept yet), so the backfill below keeps every day enabled at that
-- account's own saved hours — nobody's live suggestions change just from
-- running this migration. Only brand-new signups get the Mon-Fri-on,
-- weekends-off default below (matching the app's current
-- DEFAULT_SCHEDULING_PREFERENCES hours, 08:00-18:00).
--
-- This is step 1 of 2. Run 20260811010000_drop_flat_working_hours_columns.sql
-- only after spot-checking that the backfill below looks right — it drops
-- the old columns and can't be undone.

alter table public.profiles
  add column if not exists working_hours jsonb not null default jsonb_build_object(
    'sun', jsonb_build_object('enabled', false, 'start', '08:00', 'end', '12:00'),
    'mon', jsonb_build_object('enabled', true,  'start', '08:00', 'end', '18:00'),
    'tue', jsonb_build_object('enabled', true,  'start', '08:00', 'end', '18:00'),
    'wed', jsonb_build_object('enabled', true,  'start', '08:00', 'end', '18:00'),
    'thu', jsonb_build_object('enabled', true,  'start', '08:00', 'end', '18:00'),
    'fri', jsonb_build_object('enabled', true,  'start', '08:00', 'end', '18:00'),
    'sat', jsonb_build_object('enabled', false, 'start', '08:00', 'end', '12:00')
  );

-- Backfill: every EXISTING account keeps working all 7 days (today's real
-- behavior), at its own saved hours.
update public.profiles
set working_hours = (
  select jsonb_object_agg(day, jsonb_build_object(
    'enabled', true,
    'start', to_char(working_hours_start, 'HH24:MI'),
    'end', to_char(working_hours_end, 'HH24:MI')
  ))
  from unnest(array['sun','mon','tue','wed','thu','fri','sat']) as day
);

-- Light structural backstop only (all 7 keys present) — per-day end > start
-- validation stays app-side in validateBusinessRules, same division of
-- labor the old working-hours check constraint already had with its form
-- validation counterpart.
alter table public.profiles add constraint profiles_working_hours_shape_check
  check (working_hours ?& array['sun','mon','tue','wed','thu','fri','sat']);
