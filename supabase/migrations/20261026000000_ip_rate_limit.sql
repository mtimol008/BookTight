-- Booktight: app-level per-IP rate limiting (Phase 2)
--
-- Why this exists: login/signup/forgot-password run through Next.js Server
-- Actions on Vercel, so the request Supabase's own auth API sees always
-- comes from Vercel's server IP, not the real visitor's — Supabase's
-- built-in per-IP rate limit therefore pools every Booktight user behind
-- the same bucket. This project's API keys are still the legacy
-- anon/service_role pair, and Supabase's Sb-Forwarded-For feature (which
-- would fix this by telling Supabase the real visitor IP) requires the
-- newer secret-key type — not available here without a separate key
-- migration (tracked, not done). This table is the fallback: a tighter,
-- real-IP-scoped limit enforced by the app itself, in front of Supabase's
-- call, so one attacker's real IP gets refused before it can consume any
-- of the shared pooled budget.
--
-- Generic across callers (action is a free-text label, not an enum) so the
-- same table/function also covers /api/csp-report and /api/health, both
-- public and unauthenticated.
--
-- Fixed-window counting (not sliding): one row per (ip, action, window),
-- window_start truncated to a p_window_minutes boundary. Same simplification
-- already accepted in geocode_usage's daily bucket — a request right at a
-- window boundary can in principle see slightly more than p_limit across
-- the two adjacent windows combined, which is fine for an abuse backstop,
-- not a hard quota.
--
-- RLS enabled with NO policies, same pattern as geocode_usage/geocode_cache
-- — the only way in is the security-definer function below, called
-- exclusively via the app's service-role client (see src/lib/rateLimit.ts),
-- never with grants to anon/authenticated/public.

create table if not exists public.ip_rate_limit (
  ip_address text not null,
  action text not null,
  window_start timestamptz not null,
  attempt_count integer not null default 0,
  primary key (ip_address, action, window_start)
);

alter table public.ip_rate_limit enable row level security;

-- Atomic check-and-increment, same shape as check_and_increment_geocode_usage:
-- locks the bucket row (creating it on first use) before reading, so two
-- concurrent requests from the same IP+action can't both slip under the cap.
--
-- Also does cheap, probabilistic cleanup of stale windows (~1% of calls)
-- rather than needing pg_cron (not used anywhere in this project) or a
-- separate scheduled job — the table would otherwise grow one row per
-- IP+action+window forever.
create or replace function public.check_and_increment_ip_rate_limit(
  p_ip text,
  p_action text,
  p_window_minutes integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_attempt_count integer;
begin
  if random() < 0.01 then
    delete from public.ip_rate_limit
      where window_start < now() - interval '1 day';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60)
  );

  insert into public.ip_rate_limit (ip_address, action, window_start, attempt_count)
  values (p_ip, p_action, v_window_start, 0)
  on conflict (ip_address, action, window_start) do nothing;

  select attempt_count into v_attempt_count
  from public.ip_rate_limit
  where ip_address = p_ip and action = p_action and window_start = v_window_start
  for update;

  if v_attempt_count >= p_limit then
    return false;
  end if;

  update public.ip_rate_limit
    set attempt_count = attempt_count + 1
    where ip_address = p_ip and action = p_action and window_start = v_window_start;

  return true;
end;
$$;

-- service_role only, granted directly (not granted-then-revoked like the
-- geocode functions originally were) — baking in the fix from the Oct 25
-- security review rather than repeating the gap it found.
revoke execute on function public.check_and_increment_ip_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_and_increment_ip_rate_limit(text, text, integer, integer) to service_role;
