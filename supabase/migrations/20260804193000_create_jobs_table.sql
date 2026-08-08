-- Booktight: jobs table
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query),
-- or via `supabase db push` if you set up the CLI later.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  date date not null,
  time_slot text not null,
  customer_name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table public.jobs enable row level security;

-- TEMPORARY policy: there's no user auth yet, so this allows full
-- read/write access to anyone holding the project's anon or authenticated
-- API key (i.e. the app itself, via its Supabase client).
--
-- TODO(auth): once user accounts exist, replace this with per-user
-- policies, e.g. add a `user_id uuid references auth.users` column and
-- scope each policy with `using (auth.uid() = user_id)`. Do this before
-- letting real customer data into this table — right now any client with
-- the anon key can read/write every row.
create policy "Allow full access via API key (temporary, pre-auth)"
  on public.jobs
  for all
  to public
  using (true)
  with check (true);
