-- Booktight: capture the real IANA timezone at signup
-- Run in the Supabase SQL Editor.
--
-- profiles.timezone has defaulted to the literal string 'UTC' for every
-- account since it was added (20260811000000_calendar_feed.sql) — the
-- trigger that creates a profile row never mentioned the column, so it
-- always fell through to that default regardless of who signed up or
-- where. This is why the .ics calendar export showed morning jobs an hour
-- off for a UK account: the export tagged times as UTC when they were
-- never actually meant to be.
--
-- The app now sends the browser's real timezone
-- (Intl.DateTimeFormat().resolvedOptions().timeZone) as signup metadata,
-- same way it already sends full_name/business_name/home_address. This
-- just extends the trigger to carry it across. Falls back to 'UTC' only if
-- that metadata is somehow missing (JS disabled, very old cached page) —
-- the column is `not null`, so it needs *some* default.
--
-- Supersedes the version of this function in
-- 20260808030000_signup_business_name.sql. Safe to run any time — this
-- only affects NEW signups from here on; existing accounts stuck on 'UTC'
-- are handled separately (app-side auto-detect + an editable Account
-- field), not by this migration.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, home_address, home_latitude, home_longitude, full_name, business_name, timezone
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'home_address',
    (new.raw_user_meta_data ->> 'home_latitude')::double precision,
    (new.raw_user_meta_data ->> 'home_longitude')::double precision,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'business_name',
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC')
  );
  return new;
end;
$$;
