-- Booktight: full name + mandatory onboarding
-- Run in the Supabase SQL Editor.
--
-- Adds a display name (collected at signup going forward) and a one-time
-- onboarding gate: new accounts are walked through setting their business
-- rules (working hours, max travel range, max jobs per day) before landing
-- on the main app, instead of those settings sitting undiscovered until
-- someone happens to visit Account.

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists onboarding_completed_at timestamptz;
  -- Both nullable: full_name because existing accounts predate this column
  -- (fill in via Account -> edit profile once), onboarding_completed_at
  -- because null is exactly what means "show onboarding on next login".

-- Existing accounts shouldn't be sent through onboarding retroactively —
-- only genuinely new signups after this migration runs should see it.
update public.profiles
set onboarding_completed_at = now()
where onboarding_completed_at is null;

-- Extends the trigger from 20260804220000_add_auth.sql to also capture the
-- full name passed at signup. Existing columns/behavior unchanged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, home_address, home_latitude, home_longitude, full_name
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'home_address',
    (new.raw_user_meta_data ->> 'home_latitude')::double precision,
    (new.raw_user_meta_data ->> 'home_longitude')::double precision,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;
