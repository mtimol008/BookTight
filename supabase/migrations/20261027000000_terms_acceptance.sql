-- Booktight: terms-of-service acceptance at signup
-- Run in the Supabase SQL Editor.
--
-- Signup now requires ticking "I agree to the Terms of Service and Privacy
-- Policy" before an account can be created. This records that: which
-- version of the terms was shown (terms_version, a plain string like
-- "draft-0" — see src/lib/terms.ts for the current value), and the exact
-- moment consent was given.
--
-- Both nullable — existing accounts predate this and never agreed to
-- anything through this flow, same reasoning as onboarding_completed_at.
--
-- terms_accepted_at is set by the trigger itself (now()), not from client
-- metadata — by the time this trigger fires, the signup server action has
-- already rejected the request if the checkbox wasn't ticked, so "now" at
-- insert time is a trustworthy record of when consent was given. Only
-- terms_version (which text the user actually saw) needs to come from the
-- client. Guarded on terms_version being present: a signup that sent no
-- terms_version (an admin-created test account, or any path that predates
-- this checkbox) gets terms_accepted_at = null too, rather than a
-- timestamp with no corresponding version — "accepted, but we don't know
-- what" is worse than "didn't go through this flow at all".
--
-- Supersedes the version of this function in
-- 20260812000000_signup_timezone.sql. Safe to run any time — only affects
-- NEW signups from here on.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

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
  return new;
end;
$$;
