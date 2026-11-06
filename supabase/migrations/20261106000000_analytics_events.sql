-- Booktight: first-party analytics events (Phase 5)
-- Run in the Supabase SQL Editor.
--
-- One row per (user, event) pair, ever — the unique constraint below is
-- what makes "log each of these once per user" trivial to get right:
-- recording the same event for the same user twice is just a no-op
-- (src/lib/analytics.ts upserts with ignoreDuplicates), not something
-- callers need to check for themselves first.
--
-- RLS enabled with NO policies — same pattern as geocode_usage,
-- geocode_cache and ip_rate_limit: nobody should be able to read or write
-- this directly, including the account it's about. The only way in is the
-- service-role client (src/lib/analytics.ts and the counts script), same
-- as every other table in this schema that exists for the app's own
-- bookkeeping rather than the user's.
--
-- No cookies, no third-party script, no browser storage — every write
-- here comes from server-side code (a server action, or the Stripe
-- webhook) already running with a real user id, not a client-side
-- tracking pixel.

create table public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  created_at timestamptz not null default now()
);

alter table public.analytics_events
  add constraint analytics_events_event_check
  check (event in (
    'signup', 'onboarding_complete', 'first_job', 'third_job',
    'day2_return', 'trial_to_paid'
  ));

alter table public.analytics_events
  add constraint analytics_events_user_event_unique
  unique (user_id, event);

-- Serves "how many users did X" (the counts script) and the per-user
-- existence check an upsert's ignoreDuplicates relies on.
create index analytics_events_event_idx on public.analytics_events (event);

alter table public.analytics_events enable row level security;
