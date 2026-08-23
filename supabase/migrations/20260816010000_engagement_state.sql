-- Booktight: first-time user engagement tracking
-- Run in the Supabase SQL Editor.
--
-- One flexible JSONB bag rather than a column per flag, same pattern as
-- working_hours — a new contextual hint later doesn't need a migration,
-- just a new key. Shape (all keys optional, absent = not yet happened):
--   entryChoiceMade  boolean  — the post-onboarding "add a job" vs
--                               "show me around" choice was made
--   tourShown        boolean  — the persistent-nav tour was shown once
--   dismissedHints   string[] — contextual hint ids dismissed individually
--   ahaMomentShown   boolean  — the "first day with 2+ jobs" celebration
--                               was shown (lifetime, once)

alter table public.profiles
  add column if not exists engagement_state jsonb not null default '{}'::jsonb;

-- Backfill ahaMomentShown for any account where a day already has 2+
-- non-cancelled jobs booked — that moment already happened for them
-- before this feature existed, so showing it now on their next save would
-- be a fabricated "first," not a genuine one. Every other flag above is
-- deliberately NOT backfilled: the welcome choice, tour, and hints are
-- meant to roll out uniformly to existing accounts too, since they're
-- cheap to skip and worth validating on real usage — this is the one
-- flag where "genuinely new to this account" and "uniform rollout" would
-- otherwise conflict.
with qualifying_users as (
  select user_id
  from public.jobs
  where status != 'cancelled'
  group by user_id, date
  having count(*) >= 2
)
update public.profiles
set engagement_state = engagement_state || '{"ahaMomentShown": true}'::jsonb
where id in (select distinct user_id from qualifying_users);
