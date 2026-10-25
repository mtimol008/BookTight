-- Booktight: geocode cost controls (Phase 2)
--
-- Two tables, both RLS-enabled with NO policies at all — meaning no role
-- can read or write them directly, including a user's own row. The only
-- way in is through the `security definer` functions below, which run with
-- the function owner's privileges and bypass RLS internally. This is
-- deliberate: a per-user counter stored as plain columns on `profiles`
-- would be reachable by that same user's own "update own profile" policy,
-- letting a modified client reset its own usage count directly via the
-- REST API, bypassing every server action entirely.
--
-- geocode_usage: per-user daily call count, so an authenticated session
-- can't run up Mapbox's $5/1,000 permanent-geocoding bill unbounded.
--
-- geocode_cache: shared (not per-user) address -> coordinates cache, so
-- re-submitting a form with an unchanged address reuses the previous
-- result instead of re-billing Mapbox. Keyed on the address text alone —
-- the same address geocodes to the same place for every user, so sharing
-- the cache across accounts is strictly a cost win, not a privacy concern.

create table if not exists public.geocode_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  calls_today integer not null default 0
);

alter table public.geocode_usage enable row level security;

create table if not exists public.geocode_cache (
  address_key text primary key,
  latitude double precision not null,
  longitude double precision not null,
  formatted_address text not null,
  cached_at timestamptz not null default now()
);

alter table public.geocode_cache enable row level security;

-- Atomic check-and-increment: locks the caller's row (creating it on first
-- use) before reading, so two concurrent requests from the same user can't
-- both read the same pre-increment count and both slip under the cap.
-- Rolls the counter over when `usage_date` is stale rather than requiring
-- a separate cron/reset job.
create or replace function public.check_and_increment_geocode_usage(
  p_user_id uuid,
  p_daily_limit integer default 100
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_usage_date date;
  v_calls_today integer;
begin
  insert into public.geocode_usage (user_id, usage_date, calls_today)
  values (p_user_id, current_date, 0)
  on conflict (user_id) do nothing;

  select usage_date, calls_today into v_usage_date, v_calls_today
  from public.geocode_usage
  where user_id = p_user_id
  for update;

  if v_usage_date < current_date then
    v_calls_today := 0;
  end if;

  if v_calls_today >= p_daily_limit then
    update public.geocode_usage
      set usage_date = current_date, calls_today = v_calls_today
      where user_id = p_user_id;
    return false;
  end if;

  update public.geocode_usage
    set usage_date = current_date, calls_today = v_calls_today + 1
    where user_id = p_user_id;

  return true;
end;
$$;

-- Returns the cached result for an address, or no rows if there isn't one
-- or it's past p_ttl_hours — a plain SELECT, not a cursor, so an empty
-- result is just zero rows rather than an exception to catch.
create or replace function public.get_cached_geocode(
  p_address_key text,
  p_ttl_hours integer default 24
)
returns table (
  latitude double precision,
  longitude double precision,
  formatted_address text
)
language sql
security definer set search_path = public
as $$
  select latitude, longitude, formatted_address
  from public.geocode_cache
  where address_key = p_address_key
    and cached_at > now() - (p_ttl_hours || ' hours')::interval;
$$;

create or replace function public.set_cached_geocode(
  p_address_key text,
  p_latitude double precision,
  p_longitude double precision,
  p_formatted_address text
)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.geocode_cache (address_key, latitude, longitude, formatted_address, cached_at)
  values (p_address_key, p_latitude, p_longitude, p_formatted_address, now())
  on conflict (address_key) do update
    set latitude = excluded.latitude,
        longitude = excluded.longitude,
        formatted_address = excluded.formatted_address,
        cached_at = excluded.cached_at;
$$;

-- check_and_increment_geocode_usage is only ever called from an
-- authenticated server action (there's always a real user_id by the time
-- it's called) — signup geocodes before an account exists, so that path
-- relies on Turnstile instead, not this cap.
grant execute on function public.check_and_increment_geocode_usage(uuid, integer) to authenticated;

-- The cache is read/written from signup too, before a session exists, so
-- anon needs it as well as authenticated.
grant execute on function public.get_cached_geocode(text, integer) to anon, authenticated;
grant execute on function public.set_cached_geocode(text, double precision, double precision, text) to anon, authenticated;
