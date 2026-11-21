-- Booktight: privacy-friendly visit counts for the public pages.
--
-- Counts only. One row per (UTC day, path, ?ref= value, coarse device type),
-- with the number of browser beacons seen in that bucket. There is no id,
-- timestamp, IP address, user-agent, cookie, session or user id here: this
-- table cannot identify a visitor, and the app deliberately does not send
-- any of those things.
--
-- The beacon only fires from JavaScript on the landing page and /signup,
-- so ordinary bots that never run JS are not counted. The route also
-- requires same-origin Fetch headers. Writes go through the security-definer
-- function below, so anon/authenticated roles get no direct access at all
-- (RLS is on with no policies). Read the totals through the view at the end.

create table if not exists public.page_visits (
  visit_date date not null,
  path text not null check (path in ('/', '/signup')),
  ref text not null check (ref in ('none', 'other') or ref ~ '^[a-z0-9_-]{1,40}$'),
  device text not null check (device in ('mobile', 'desktop')),
  visits integer not null default 0 check (visits >= 0),
  primary key (visit_date, path, ref, device)
);

alter table public.page_visits enable row level security;

revoke all on public.page_visits from public, anon, authenticated;
grant select, insert, update, delete on public.page_visits to service_role;

-- Upsert one beacon into today's bucket. Normalisation is repeated here as
-- well as in the app, so a direct RPC call can't smuggle in a long or oddly
-- formatted ref value. Invalid path/device values are ignored, not stored.
create or replace function public.record_page_visit(
  p_path text,
  p_ref text,
  p_device text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ref text;
begin
  if p_path not in ('/', '/signup') then
    return;
  end if;

  if p_device not in ('mobile', 'desktop') then
    return;
  end if;

  v_ref := lower(btrim(coalesce(p_ref, '')));
  if v_ref = '' then
    v_ref := 'none';
  elsif v_ref !~ '^[a-z0-9_-]{1,40}$' then
    v_ref := 'other';
  end if;

  insert into public.page_visits (visit_date, path, ref, device, visits)
  values ((timezone('UTC', now()))::date, p_path, v_ref, p_device, 1)
  on conflict (visit_date, path, ref, device)
  do update set visits = public.page_visits.visits + 1;
end;
$$;

revoke all on function public.record_page_visit(text, text, text) from public, anon, authenticated;
grant execute on function public.record_page_visit(text, text, text) to service_role;

-- The tiny read-only view: run `select * from public.page_visit_counts;`
-- in the SQL Editor. Revoked from anon/authenticated as well as public,
-- so it is only readable with elevated (SQL Editor / service-role) access.
create or replace view public.page_visit_counts as
select visit_date, path, ref, device, visits
from public.page_visits
order by visit_date desc, path, ref, device;

revoke all on public.page_visit_counts from public, anon, authenticated;
grant select on public.page_visit_counts to service_role;
