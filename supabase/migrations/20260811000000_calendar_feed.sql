-- Booktight: Calendar feed (iCal export)
-- Run this in the Supabase SQL Editor

-- Add feed token, enabled flag, and user timezone to profiles
alter table public.profiles
  add column if not exists calendar_feed_token text unique,
  add column if not exists calendar_feed_enabled boolean not null default false,
  add column if not exists timezone text not null default 'UTC';

-- Index for token lookup
create index if not exists profiles_calendar_feed_token_idx on public.profiles (calendar_feed_token);

-- Comment for clarity
comment on column public.profiles.calendar_feed_token is 'Unguessable token for the subscribable iCal feed URL';
comment on column public.profiles.calendar_feed_enabled is 'Whether the feed is active';
comment on column public.profiles.timezone is 'User IANA timezone (e.g. America/Los_Angeles) for calendar event times';