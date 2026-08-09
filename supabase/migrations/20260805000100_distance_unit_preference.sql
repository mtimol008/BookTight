-- Booktight: add user distance unit preference
--
-- Adds a distance unit preference to profiles so users can choose between
-- kilometers and miles. Distances remain stored and computed in km, but
-- the UI and suggested text respect the selected unit.

alter table public.profiles add column if not exists distance_unit text not null default 'km';

update public.profiles set distance_unit = 'km' where distance_unit is null;

alter table public.profiles add constraint profiles_distance_unit_check check (distance_unit in ('km', 'mi'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    home_address,
    home_latitude,
    home_longitude,
    distance_unit
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'home_address',
    (new.raw_user_meta_data ->> 'home_latitude')::double precision,
    (new.raw_user_meta_data ->> 'home_longitude')::double precision,
    coalesce(new.raw_user_meta_data ->> 'distance_unit', 'km')
  );
  return new;
end;
$$;
