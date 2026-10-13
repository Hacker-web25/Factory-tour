-- AI presentation analysis (ULTRA).
--
-- Adds:
--   1. organizations.plan            — 'pro' | 'ultra'. Gates AI analysis.
--   2. presentation_sessions.ai_*    — speaker-separated transcript, the
--                                      AI coaching report and its score.
--   3. save_presentation_ai()        — the ONLY write path for ai_* columns.
--                                      Security definer; checks the caller is
--                                      org_admin/owner of the session's org.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

/* ---------- 1. Plan tier on organizations ---------------------------- */

alter table public.organizations
  add column if not exists plan text not null default 'pro';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_plan_check'
  ) then
    alter table public.organizations
      add constraint organizations_plan_check check (plan in ('pro', 'ultra'));
  end if;
end $$;

/* ---------- 2. AI columns on presentation_sessions ------------------- */

alter table public.presentation_sessions
  add column if not exists ai_transcript_status text,          -- queued | processing | completed | error
  add column if not exists ai_transcript_job    text,          -- AssemblyAI transcript id
  add column if not exists ai_transcript_error  text,
  add column if not exists ai_dialogue          jsonb,         -- { source, language, turns[] }
  add column if not exists ai_speaker_map       jsonb,         -- { "A": "salesperson", "B": "customer" }
  add column if not exists ai_analysis          jsonb,         -- full coaching report
  add column if not exists ai_score             integer,       -- 0-100, denormalised for sorting
  add column if not exists ai_model             text,
  add column if not exists ai_analyzed_at       timestamptz;

create index if not exists presentation_sessions_ai_score_idx
  on public.presentation_sessions (org_id, ai_score)
  where ai_score is not null;

/* ---------- 3. Write RPC --------------------------------------------- */

create or replace function public.save_presentation_ai(
  p_session_id text,
  p_patch      jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org
  from public.presentation_sessions
  where session_id::text = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'owner'
        or (p.role = 'org_admin' and p.org_id = v_org)
      )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Only whitelisted ai_* keys are applied; anything else in the patch
  -- is ignored, so this RPC can never touch recording/GPS/outcome data.
  update public.presentation_sessions set
    ai_transcript_status = case when p_patch ? 'ai_transcript_status' then p_patch->>'ai_transcript_status' else ai_transcript_status end,
    ai_transcript_job    = case when p_patch ? 'ai_transcript_job'    then p_patch->>'ai_transcript_job'    else ai_transcript_job    end,
    ai_transcript_error  = case when p_patch ? 'ai_transcript_error'  then p_patch->>'ai_transcript_error'  else ai_transcript_error  end,
    ai_dialogue          = case when p_patch ? 'ai_dialogue'          then p_patch->'ai_dialogue'           else ai_dialogue          end,
    ai_speaker_map       = case when p_patch ? 'ai_speaker_map'       then p_patch->'ai_speaker_map'        else ai_speaker_map       end,
    ai_analysis          = case when p_patch ? 'ai_analysis'          then p_patch->'ai_analysis'           else ai_analysis          end,
    ai_score             = case when p_patch ? 'ai_score'             then (p_patch->>'ai_score')::int      else ai_score             end,
    ai_model             = case when p_patch ? 'ai_model'             then p_patch->>'ai_model'             else ai_model             end,
    ai_analyzed_at       = case when p_patch ? 'ai_analyzed_at'       then (p_patch->>'ai_analyzed_at')::timestamptz else ai_analyzed_at end,
    updated_at           = now()
  where session_id::text = p_session_id;
end;
$$;

revoke all on function public.save_presentation_ai(text, jsonb) from public;
grant execute on function public.save_presentation_ai(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

/* ---------- Turning ULTRA on for a customer ---------------------------
   update public.organizations set plan = 'ultra' where slug = 'dukaan';
------------------------------------------------------------------------ */
