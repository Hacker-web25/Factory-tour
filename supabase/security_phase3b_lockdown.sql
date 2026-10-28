-- ============================================================================
-- security_phase3b_lockdown.sql — share links and unlisted tours are enforced by the database.
-- ============================================================================
-- PREREQUISITES
--     security_phase1 / 2a / 2b / 2c applied;  security_phase3a_additive.sql applied;
--     the app version that sends the viewer headers (lib/viewContext.ts, lib/supabase.ts) deployed.
--     Applying this BEFORE that app version is live would blank unlisted tours and share links.
--
-- WHAT IT DOES
--   1. vpv_tour_visible() — the one rule behind every public read of tours / scenes / hotspots — no longer
--      says "any unlisted tour" or "any tour that has a live share link".  A tour is public to a stranger
--      only if it is public/published, or the request names it (unlisted) with the password proof when it
--      has a password, or presents a live share link's token (+ password proof, e-mail, device) for it.
--      Unlisted tours and link-only tours can therefore no longer be listed or scraped.
--   2. share_links can no longer be read with the public key (tokens and password hashes were open).
--      Signed-in people read links of tours they may use; a presenter reads their own.
--
-- Rollback: security_phase3b_rollback.sql
-- ============================================================================

begin;

create or replace function public.vpv_tour_visible(p_tour uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select public.is_platform_owner()
      or exists (
        select 1 from public.tours t
         where t.id = p_tour
           and (
                coalesce(t.published, false)
             or coalesce(t.visibility, 'private') = 'public'
             or (auth.uid() is not null and t.org_id is not null and t.org_id = public.vpv_my_org())
             or (auth.uid() is not null and exists (
                  select 1 from public.tour_assignments ta
                   where ta.tour_id = t.id and ta.user_id = auth.uid()))
             or (coalesce(t.visibility, 'private') = 'unlisted'
                 and public.vpv_hdr('x-view-tour') = t.id::text
                 and (nullif(t.unlisted_password, '') is null
                      or public.vpv_hdr('x-tour-grant') = public.vpv_grant('tour', t.id::text, t.unlisted_password)))
             or public.vpv_link_allows_read(t.id)
           )
      )
$$;

drop policy if exists vpv_share_links_select_open on public.share_links;
create policy vpv_share_links_select on public.share_links for select to authenticated
  using (public.vpv_can_use_tour(tour_id) or owner_user_id = auth.uid());

revoke select on public.share_links from anon;

commit;
