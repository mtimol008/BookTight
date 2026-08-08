-- Booktight: clear test data + tighten RLS (Migration B)
--
-- Run this in the Supabase SQL Editor, any time after Migration A. The
-- existing 8 jobs were purely test data (confirmed — not being kept or
-- linked to any account), so this deletes them outright rather than
-- backfilling user_id for them.

delete from public.jobs;

alter table public.jobs
  alter column user_id set not null;

drop policy if exists "Allow full access via API key (temporary, pre-auth)"
  on public.jobs;

create policy "Users can view their own jobs"
  on public.jobs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own jobs"
  on public.jobs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own jobs"
  on public.jobs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own jobs"
  on public.jobs
  for delete
  to authenticated
  using (auth.uid() = user_id);
