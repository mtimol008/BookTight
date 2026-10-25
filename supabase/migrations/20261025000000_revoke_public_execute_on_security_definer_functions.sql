-- Booktight: close the default-PUBLIC-execute gap on every security
-- definer function.
--
-- PostgreSQL grants EXECUTE to PUBLIC on every new function by default,
-- unless explicitly revoked. The geocode_usage_and_cache migration granted
-- check_and_increment_geocode_usage to authenticated only, and
-- get_cached_geocode/set_cached_geocode to anon+authenticated — but never
-- revoked the PUBLIC default underneath those grants. Confirmed live: an
-- anonymous, unauthenticated caller could call
-- check_and_increment_geocode_usage with ANY user_id and increment that
-- user's real daily counter, and set_cached_geocode with no validation at
-- all, letting anyone poison the shared address cache for any address
-- string.
--
-- The app server now calls all three exclusively through its own
-- service-role client (see src/lib/geocoding.ts), taking the user id from
-- the caller's own verified session, never from client input. No
-- browser-facing role (anon or authenticated) needs direct RPC access to
-- any of them anymore.
--
-- RUN THIS ONLY AFTER the service-role-client code (commit with this same
-- migration) is live — service_role already has access under both the old
-- and new grants, so that code works unchanged before and after this
-- revoke. Running this first, before that code is deployed, would break
-- every geocode call.

revoke execute on function public.check_and_increment_geocode_usage(uuid, integer) from public, anon, authenticated;
revoke execute on function public.get_cached_geocode(text, integer) from public, anon, authenticated;
revoke execute on function public.set_cached_geocode(text, double precision, double precision, text) from public, anon, authenticated;

grant execute on function public.check_and_increment_geocode_usage(uuid, integer) to service_role;
grant execute on function public.get_cached_geocode(text, integer) to service_role;
grant execute on function public.set_cached_geocode(text, double precision, double precision, text) to service_role;

-- handle_new_user is only ever invoked by its own trigger
-- (on_auth_user_created) — never called directly via RPC by any role, so
-- revoking the PUBLIC default here closes the same gap defensively with
-- no behavior change. A trigger firing doesn't require the triggering
-- role to hold EXECUTE on the trigger function.
revoke execute on function public.handle_new_user() from public;
