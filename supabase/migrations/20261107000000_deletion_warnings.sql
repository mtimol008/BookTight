-- Booktight: 90-day deletion warnings (Phase 5, Stage 5)
-- Run in the Supabase SQL Editor.
--
-- lapsed_at is the one persisted fact this adds to subscriptions: the
-- moment an account actually lost entitlement, set once by the
-- deletion-warning cron (src/lib/deletionWarnings.ts) the first time it
-- finds an account not entitled, and cleared back to null the moment the
-- same cron finds it entitled again (resubscribed, comped, or an admin
-- override) — at which point deletion_warning_log below is wiped too, so a
-- future lapse starts its own 90-day clock from zero. Everything before
-- that first "not entitled" run is only ever derived on demand
-- (lapsedSince() / effectiveLapsedAt() in src/lib/entitlement.ts) — this
-- column exists only to give the clock a stable anchor that doesn't drift
-- as trial_ends_at / current_period_end / comped_until change underneath
-- it after the fact.
alter table public.subscriptions
  add column lapsed_at timestamptz;

-- Idempotency log for the warning emails — a row here means that exact
-- milestone email has already gone out for that user, full stop. The cron
-- claims a milestone by inserting here BEFORE sending (the unique
-- constraint below makes a double-claim impossible even if two runs
-- somehow overlap), then deletes its own claim again if the send itself
-- fails, so a failed send is retried on the next run rather than silently
-- skipped forever. This table also doubles as the one thing the cron
-- checks before it will ever delete an account: it refuses unless a
-- 'day_89' row here is at least 7 days old. RLS enabled with no policies —
-- service-role only, same pattern as stripe_webhook_events.
create table public.deletion_warning_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, milestone)
);

alter table public.deletion_warning_log
  add constraint deletion_warning_log_milestone_check
  check (milestone in ('lapsed', 'day_30', 'day_60', 'day_80', 'day_89'));

alter table public.deletion_warning_log enable row level security;

-- The permanent record that an account was deleted, and why. Deliberately
-- NOT foreign-keyed to auth.users, unlike every other table in this
-- schema — the whole point of this table is that its rows survive the
-- very deletion they're describing, which an "on delete cascade" FK would
-- wipe out at exactly the moment it matters. RLS enabled with no
-- policies — service-role only; nobody ever has a session to read this
-- from, since by definition the account it's about no longer exists.
create table public.account_deletion_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  reason text not null check (reason in ('user_requested', 'auto_90_day')),
  jobs_count integer not null default 0,
  deleted_at timestamptz not null default now()
);

alter table public.account_deletion_log enable row level security;
