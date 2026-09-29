-- Add an "outcome" field to presentation_sessions so the Sales Team MIS
-- can count deals closed per salesperson.
--
-- Values kept as a plain text so we can grow the vocabulary later
-- ("closed", "pending", "lost", "follow_up") without another migration.
-- Null = not yet marked.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

alter table public.presentation_sessions
  add column if not exists outcome text;

create index if not exists presentation_sessions_outcome_idx
  on public.presentation_sessions (outcome)
  where outcome is not null;

notify pgrst, 'reload schema';
