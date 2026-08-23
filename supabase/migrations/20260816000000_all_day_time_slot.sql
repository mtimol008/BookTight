-- Booktight: add an "all day" time slot
-- Run in the Supabase SQL Editor.
--
-- A distinct time concept, not a big duration number: an all-day job
-- occupies the whole working day and nothing else can be booked alongside
-- it, which is a different question ("can this day hold anything else?")
-- from how long any one job takes. The application layer enforces the
-- "one all-day job, or any number of regular jobs, never both" rule (warn
-- with an override, same as every other scheduling conflict) — this
-- migration just widens the column to allow the value through.

alter table public.jobs drop constraint jobs_time_slot_type_check;

alter table public.jobs add constraint jobs_time_slot_type_check
  check (time_slot_type in ('morning', 'afternoon', 'evening', 'night', 'specific', 'none', 'all_day'));

-- jobs_specific_time_consistency (specific_time set iff type = 'specific')
-- already covers 'all_day' correctly as-is: it only ever requires
-- specific_time to be null for any non-'specific' type, which an all-day
-- job already satisfies. No change needed there.
