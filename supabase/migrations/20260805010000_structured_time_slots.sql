-- Booktight: structured time-of-day scheduling
-- Run in the Supabase SQL Editor.
--
-- Replaces the free-text `time_slot` column with a structured
-- `time_slot_type` (morning/afternoon/evening/night/specific/none) plus an
-- optional `specific_time`, so the scheduling algorithm can actually order
-- a day's jobs chronologically instead of treating time as a cosmetic label.

alter table public.jobs add column if not exists time_slot_type text;
alter table public.jobs add column if not exists specific_time time;

-- Best-effort migration of existing free-text values: case-insensitive
-- match against the four named slots, otherwise 'none' (flexible) — always
-- a safe fallback since it just means "no fixed position", never invalid
-- data.
update public.jobs
set time_slot_type = case lower(trim(time_slot))
  when 'morning' then 'morning'
  when 'afternoon' then 'afternoon'
  when 'evening' then 'evening'
  when 'night' then 'night'
  else 'none'
end
where time_slot_type is null;

alter table public.jobs alter column time_slot_type set not null;

alter table public.jobs add constraint jobs_time_slot_type_check
  check (time_slot_type in ('morning', 'afternoon', 'evening', 'night', 'specific', 'none'));

-- A specific_time value must be present if and only if the type is 'specific'.
alter table public.jobs add constraint jobs_specific_time_consistency
  check ((time_slot_type = 'specific') = (specific_time is not null));

alter table public.jobs drop column if exists time_slot;
