-- Booktight: region -> home address migration
--
-- Run this in the Supabase SQL Editor. It replaces the old "region" concept
-- (a city/area name with an optional Mapbox bounding box) with a real home
-- address (address text + exact coordinates), used to (a) softly bias
-- address autocomplete toward nearby results and (b) anchor each day's
-- home -> jobs -> home travel-distance calculation.
--
-- A region name isn't a real address, so there's no automatic conversion:
-- this deletes the profile row for the account you're not keeping
-- (ussitim08@gmail.com is the one being kept, confirmed), and sets a real
-- geocoded home address on the one you are.

-- 1. Drop the old region_* columns.
alter table public.profiles drop column if exists region;
alter table public.profiles drop column if exists region_latitude;
alter table public.profiles drop column if exists region_longitude;
alter table public.profiles drop column if exists region_min_lon;
alter table public.profiles drop column if exists region_min_lat;
alter table public.profiles drop column if exists region_max_lon;
alter table public.profiles drop column if exists region_max_lat;

-- 2. Add the new home address columns (nullable for now — set not null
--    once every remaining row has a value, at the bottom of this file).
alter table public.profiles add column if not exists home_address text;
alter table public.profiles add column if not exists home_latitude double precision;
alter table public.profiles add column if not exists home_longitude double precision;

-- 3. Remove the other test account's profile row — it has no home address
--    and, since there's no "edit profile" page yet, no way to set one.
delete from public.profiles
  where id <> (select id from auth.users where email = 'ussitim08@gmail.com');

-- 4. Set the real home address for the account being kept. Handles both
--    cases: the row already exists (update) or doesn't yet (insert).
update public.profiles
  set
    home_address = '57 Stamford Street, Old Trafford, Manchester, M16 9JJ, United Kingdom',
    home_latitude = 53.46159,
    home_longitude = -2.26452
  where id = (select id from auth.users where email = 'ussitim08@gmail.com');

insert into public.profiles (id, home_address, home_latitude, home_longitude)
select
  id,
  '57 Stamford Street, Old Trafford, Manchester, M16 9JJ, United Kingdom',
  53.46159,
  -2.26452
from auth.users
where email = 'ussitim08@gmail.com'
  and id not in (select id from public.profiles);

-- 5. Now that every remaining row has a value, lock the columns down.
alter table public.profiles alter column home_address set not null;
alter table public.profiles alter column home_latitude set not null;
alter table public.profiles alter column home_longitude set not null;

-- 6. Update the signup trigger so future signups write home_address/
--    home_latitude/home_longitude instead of the old region_* fields.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, home_address, home_latitude, home_longitude)
  values (
    new.id,
    new.raw_user_meta_data ->> 'home_address',
    (new.raw_user_meta_data ->> 'home_latitude')::double precision,
    (new.raw_user_meta_data ->> 'home_longitude')::double precision
  );
  return new;
end;
$$;
