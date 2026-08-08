-- Booktight: cascade job deletion when an account is deleted
-- Run in the Supabase SQL Editor.
--
-- jobs.user_id (added in 20260804220000_add_auth.sql) references auth.users
-- with no ON DELETE clause, which defaults to NO ACTION — deleting a user
-- who still has jobs would fail with a foreign key violation instead of
-- cleanly removing them. Needed for account deletion (Delete Account),
-- which deletes the auth.users row directly via the admin API.

alter table public.jobs
  drop constraint if exists jobs_user_id_fkey;

alter table public.jobs
  add constraint jobs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
