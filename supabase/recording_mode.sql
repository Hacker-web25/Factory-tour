-- recording_mode: how a presentation starts recording.
--
--   'auto'   — recording starts automatically when a sales rep opens a
--              presenter-led session. (The current default behaviour.)
--   'manual' — the sales rep sees a popup at the start of the session and
--              chooses to record or skip. VPV cannot provide meeting data
--              for a session the rep did not record.
--
-- Defaults to 'auto'. Existing rows are backfilled from the older boolean
-- `auto_record` so no org loses their choice: true → 'auto', false → 'manual'.
-- `auto_record` is kept in place for one deploy of safety; the application
-- reads `recording_mode` from now on.

alter table public.organizations
  add column if not exists recording_mode text
    not null default 'auto'
    check (recording_mode in ('auto', 'manual'));

update public.organizations
   set recording_mode = case
         when auto_record is true  then 'auto'
         when auto_record is false then 'manual'
         else 'auto'
       end
 where true;  -- re-run safe: idempotent given the CHECK

comment on column public.organizations.recording_mode is
  'How presenter sessions start recording. auto = starts automatically; manual = the sales rep decides at a popup.';
