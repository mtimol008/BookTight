-- Booktight: add accounts (Migration A)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
--
-- This migration is safe to run immediately — it does NOT touch the existing
-- permissive policy on `jobs`, so nothing breaks in the meantime. It only
-- adds the new auth-related schema. The old policy gets replaced by a
-- per-user one in the next migration (20260804220100_tighten_jobs_rls.sql),
-- which also clears out the existing test jobs (confirmed disposable —
-- not linked to any account) and can be run any time after this one.

-- One row per account, holding the home address used to (a) softly bias
-- address autocomplete toward nearby results and (b) anchor each day's
-- travel-distance calculation (home -> jobs -> home).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  home_address text not null,
  home_latitude double precision not null,
  home_longitude double precision not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Nullable for now — existing rows have no owner until the one-time backfill
-- in the next migration. `not null` gets added there too, once every row has
-- a value.
alter table public.jobs
  add column if not exists user_id uuid references auth.users(id);

-- Creates the profiles row automatically when someone signs up, using the
-- home address data the signup form passed into auth.signUp()'s
-- `options.data`.
--
-- This runs as a trigger (not a plain app-side insert after signUp()) on
-- purpose: Supabase Auth requires email confirmation by default, so right
-- after signUp() there's no active session yet — an app-side insert would
-- fail the "Users can insert their own profile" RLS check above, since
-- auth.uid() isn't set until the user actually confirms and logs in.
-- `security definer` lets this trigger bypass RLS to write the row anyway.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, home_address, home_latitude, home_longitude
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'home_address',
    (new.raw_user_meta_data ->> 'home_latitude')::double precision,
    (new.raw_user_meta_data ->> 'home_longitude')::double precision
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
