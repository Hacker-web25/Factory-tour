-- ============================================================================
-- security_phase2a_additive.sql — new database functions the app needs BEFORE the
-- Phase 2b lockdown.  Purely additive: nothing is removed, nothing is tightened,
-- so it is safe to run at any time (before or after Phase 1).
--
-- ORDER OF ROLL-OUT
--     1. security_phase1.sql              (account takeover + org/profile/invite lockdown)
--     2. security_phase2a_additive.sql    (this file)
--     3. deploy the app version that calls these functions (branch security-hardening)
--     4. security_phase2b_lockdown.sql    (close writes / private reads / storage)
--
-- WHY
--   • share_links.view_count / last_opened_at were bumped by the VIEWER'S BROWSER
--     with a direct UPDATE, which only worked because the whole table was open to
--     the internet.  The RPC the code already tried first (increment_share_link_view)
--     never existed in the database, so the "fallback" write was the only path.
--   • The device-limit check read every viewer's tour_events row (fingerprint,
--     e-mail, city) from the browser.  It now asks one question and gets one answer.
-- ============================================================================

begin;

-- A viewer opened a share link: count it, but only while the link is still valid.
create or replace function public.increment_share_link_view(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.share_links
     set view_count     = coalesce(view_count, 0) + 1,
         last_opened_at = now()
   where id = p_id
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and (view_limit is null or coalesce(view_count, 0) < view_limit);
end;
$$;

-- How many distinct devices have opened this link, and is `p_fp` one of them?
create or replace function public.share_link_device_status(p_link uuid, p_fp text)
returns table (seen bigint, mine boolean)
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct te.viewer_fingerprint) filter (where te.viewer_fingerprint is not null),
         coalesce(bool_or(te.viewer_fingerprint is not null and te.viewer_fingerprint = p_fp), false)
    from public.tour_events te
   where te.share_link_id = p_link
$$;

revoke all on function public.increment_share_link_view(uuid)           from public;
revoke all on function public.share_link_device_status(uuid, text)      from public;
grant execute on function public.increment_share_link_view(uuid)        to anon, authenticated, service_role;
grant execute on function public.share_link_device_status(uuid, text)   to anon, authenticated, service_role;

commit;
