-- Booktight: subscriptions (Phase 4, Stripe test mode)
-- Run in the Supabase SQL Editor.
--
-- One row per account, in its own table rather than more profiles columns
-- — same reasoning as geocode_usage/geocode_cache/ip_rate_limit: this is
-- data the owning user must never be able to write directly (a PATCH
-- setting their own status to 'active' would be free premium access).
--
-- RLS: the user can read their own row (so /billing can show their plan
-- and trial_ends_at) but there is no insert/update/delete policy at all —
-- any direct write attempt via the regular client is refused by RLS's
-- default-deny. The only writes ever come from the service-role client
-- (the Stripe webhook route, the billing server actions, and account
-- deletion), which bypasses RLS entirely, same as every other
-- service-role-only table in this schema.
--
-- status mirrors Stripe's own subscription.status values verbatim (synced
-- by the webhook) rather than inventing a separate app-level enum — null
-- means "never subscribed". trial_ends_at is this app's own clock, kept
-- independent of Stripe: the trial has no card and no Stripe object behind
-- it at all, so there is nothing for Stripe to track until someone
-- actually starts Checkout. comped_until is a manual override (set by
-- hand in the SQL Editor for the three comped accounts), null = not
-- comped.

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text,
  plan text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Null for every existing account until the day the paywall switches on
  -- (a separate, later one-time UPDATE, run by hand — not part of this
  -- migration, since that day hasn't happened yet). New signups get a real
  -- value from the trigger below from the moment this migration runs,
  -- whether or not the paywall is actually enforced yet (see
  -- PAYWALL_ENABLED) — harmless either way, since enforcement reads this
  -- column but nothing acts on it until that flag is on.
  trial_ends_at timestamptz,
  comped_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status is null or status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  ));

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan is null or plan in ('monthly', 'yearly'));

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscription"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Idempotency log for the Stripe webhook — a row is inserted only after an
-- event has been fully processed (see src/app/api/stripe/webhook, which
-- deletes the row again if processing fails partway through), so a retried
-- delivery of an event already recorded here is a safe no-op, and a
-- delivery that previously failed partway through is correctly retried in
-- full rather than silently skipped. RLS enabled with no policies — same
-- pattern as ip_rate_limit, reachable only via the service-role client.
create table public.stripe_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

-- Extends the trigger from 20261027000000_terms_acceptance.sql to also
-- bootstrap a subscriptions row for every new signup, in the same
-- transaction as the profile row — atomic, so there's no window where an
-- account exists with a profile but no subscriptions row. trial_ends_at
-- is set here unconditionally (see the column comment above for why that's
-- safe pre-launch).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, home_address, home_latitude, home_longitude, full_name, business_name,
    timezone, terms_version, terms_accepted_at
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'home_address',
    (new.raw_user_meta_data ->> 'home_latitude')::double precision,
    (new.raw_user_meta_data ->> 'home_longitude')::double precision,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'business_name',
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC'),
    new.raw_user_meta_data ->> 'terms_version',
    case when new.raw_user_meta_data ->> 'terms_version' is not null then now() else null end
  );

  insert into public.subscriptions (user_id, trial_ends_at)
  values (new.id, now() + interval '14 days');

  return new;
end;
$$;

-- Backfill: every account that already exists today gets a subscriptions
-- row too, with trial_ends_at left null — the switch-on day's own UPDATE
-- (run separately, by hand, when the paywall actually goes live) is what
-- sets every existing account's trial to start together on that day. Scoped
-- to profiles rather than auth.users directly since every real account
-- already has a profiles row via this same trigger.
insert into public.subscriptions (user_id, trial_ends_at)
select id, null
from public.profiles
on conflict (user_id) do nothing;
