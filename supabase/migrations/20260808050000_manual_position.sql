-- Booktight: manual drag-to-reorder override
-- Run in the Supabase SQL Editor.
--
-- Lets a tradesperson manually override the computed order of jobs that
-- share an ambiguous position (the same named time slot, or several
-- flexible jobs) — the computer's nearest-neighbor/cheapest-insertion
-- guess is still the default, this only overrides it when set.

alter table public.jobs add column if not exists manual_position integer;

-- Only meaningful relative to siblings sharing the same (date,
-- time_slot_type) — not a global ordering, so no uniqueness constraint
-- across the whole table.
