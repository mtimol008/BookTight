-- Booktight: capture business name at signup
-- Run in the Supabase SQL Editor.
--
-- Business name moved from "edit it later on Account" to a real signup
-- field, alongside the other identity fields (full name, email, home
-- address). The trigger that creates the profile row therefore needs to
-- carry it across from the signup metadata too, or the value the form
-- collects would be silently dropped.
--
-- Supersedes the version of this function in
-- 20260808010000_full_name_and_onboarding.sql. Safe to run even if that
-- one already ran — create or replace just redefines the function, and
-- the trigger binding from 20260804220000_add_auth.sql is unchanged.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, home_address, home_latitude, home_longitude, full_name, business_name
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'home_address',
    (new.raw_user_meta_data ->> 'home_latitude')::double precision,
    (new.raw_user_meta_data ->> 'home_longitude')::double precision,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'business_name'
  );
  return new;
end;
$$;
