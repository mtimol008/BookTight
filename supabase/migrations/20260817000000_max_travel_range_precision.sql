-- Booktight: store max travel range with sub-kilometre precision
-- Run in the Supabase SQL Editor.
--
-- max_travel_range_km was an integer, so a value entered in miles got
-- rounded to the nearest whole km before storage. A km grid that coarse
-- (~0.62 mi per step) can't represent a value entered to 0.1 mi precision,
-- so the number shown back on Account/onboarding (converted back to miles)
-- could visibly differ from what was typed — e.g. entering 25.0 mi could
-- redisplay as 24.9 mi.
--
-- double precision matches how the rest of the schema already stores
-- decimal values (home_latitude/home_longitude), and — unlike numeric —
-- PostgREST returns it as a real JSON number rather than a string, so no
-- client-side parsing changes are needed. The app now rounds to one
-- decimal place of km when saving, fine enough that a value entered to 0.1
-- mi/km precision round-trips back to the same displayed number.

alter table public.profiles
  alter column max_travel_range_km type double precision
  using max_travel_range_km::double precision;

alter table public.profiles
  alter column max_travel_range_km set default 65;
