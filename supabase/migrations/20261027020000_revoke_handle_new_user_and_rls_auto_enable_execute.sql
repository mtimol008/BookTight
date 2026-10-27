-- Booktight: close the EXECUTE-grant gap on handle_new_user and rls_auto_enable
-- Run in the Supabase SQL Editor.
--
-- Confirmed via REST RPC probe (both as anon and as a signed-in user):
--   - handle_new_user(): PostgREST refuses to route to it at all (PGRST202,
--     "no matches found in the schema cache") since it's a trigger
--     function, never exposed as an RPC endpoint regardless of role. Its
--     PUBLIC execute grant was already revoked in
--     20261025000000_revoke_public_execute_on_security_definer_functions.sql
--     — this makes the anon/authenticated revoke explicit too, matching
--     the style used for every other function in this schema, rather than
--     relying on the PUBLIC revoke cascading implicitly.
--   - rls_auto_enable(): not created by any migration in this project —
--     found live during a read-only audit (origin unknown, likely a
--     Supabase-platform event-trigger handler, going by its "cannot
--     display a value of type event_trigger" response). The probe proves
--     it currently executes for both anon and authenticated — Postgres's
--     default PUBLIC execute grant on it was never revoked, the same gap
--     the Oct 25 review found and fixed for the geocode functions.
--
-- Neither function has any legitimate reason to be called directly by a
-- browser-facing role: handle_new_user only ever runs via its own trigger
-- (on_auth_user_created), and whatever rls_auto_enable's real job is, it
-- isn't something a logged-in user or a signed-out visitor should ever
-- invoke themselves. Revoking EXECUTE here doesn't touch either function's
-- actual trigger wiring — a trigger (row-level or event-level) fires on
-- its own hook, not through a role's EXECUTE grant on the function.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
