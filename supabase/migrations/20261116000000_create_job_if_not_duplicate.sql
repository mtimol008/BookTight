-- Booktight: atomic duplicate-submit guard for job creation
-- Run in the Supabase SQL Editor, or via `supabase db push`.
--
-- confirmAndSaveJob previously checked for a recent matching job, then
-- inserted — a plain SELECT-then-INSERT, which two near-simultaneous raw
-- requests (a double-click bypassing the client's disabled-submit-button
-- guard, or a raw duplicate Next-Action request) can both pass before
-- either INSERT commits, creating two jobs anyway. pg_advisory_xact_lock
-- serializes this per user for the life of the transaction, closing that
-- race — confirmed to actually happen without it (two literally-parallel
-- requests both created a job in testing).
create or replace function public.create_job_if_not_duplicate(
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_date date,
  p_time_slot_type text,
  p_specific_time time,
  p_customer_name text,
  p_description text,
  p_duration_minutes integer,
  p_urgency text,
  p_window_seconds integer default 10
)
returns public.jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.jobs;
  v_inserted public.jobs;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Advisory locks are per-session/transaction, not a row or table lock —
  -- one user's submissions never block another's, and this one is
  -- released automatically at the end of the transaction either way.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select * into v_existing
  from public.jobs
  where user_id = v_user_id
    and customer_name = p_customer_name
    and date = p_date
    and time_slot_type = p_time_slot_type
    and (specific_time = p_specific_time or (specific_time is null and p_specific_time is null))
    and created_at >= now() - (p_window_seconds || ' seconds')::interval
  order by created_at desc
  limit 1;

  if found then
    return v_existing;
  end if;

  insert into public.jobs (
    user_id, address, latitude, longitude, date, time_slot_type,
    specific_time, customer_name, description, duration_minutes, urgency
  )
  values (
    v_user_id, p_address, p_latitude, p_longitude, p_date, p_time_slot_type,
    p_specific_time, p_customer_name, p_description, p_duration_minutes, p_urgency
  )
  returning * into v_inserted;

  return v_inserted;
end;
$$;

-- security invoker + RLS already scopes every read/write in this function
-- to auth.uid()'s own rows — this still closes the same default-PUBLIC-
-- execute gap the other functions in this project explicitly close, on
-- general principle (see 20261025000000's own comment for the reasoning).
revoke execute on function public.create_job_if_not_duplicate(
  text, double precision, double precision, date, text, time, text, text, integer, text, integer
) from public, anon;
grant execute on function public.create_job_if_not_duplicate(
  text, double precision, double precision, date, text, time, text, text, integer, text, integer
) to authenticated;
