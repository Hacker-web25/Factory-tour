-- Rollback for security_phase3b_lockdown.sql: back to "any non-private tour, or any tour with a live link, is
-- public; share_links readable by everyone".  (Phase 3a stays; it only adds functions.)
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
             or coalesce(t.visibility, 'private') <> 'private'
             or (auth.uid() is not null and t.org_id is not null and t.org_id = public.vpv_my_org())
             or exists (
                  select 1 from public.share_links sl
                   where sl.tour_id = t.id
                     and sl.revoked_at is null
                     and (sl.expires_at is null or sl.expires_at > now()))
             or (auth.uid() is not null and exists (
                  select 1 from public.tour_assignments ta
                   where ta.tour_id = t.id and ta.user_id = auth.uid()))
           )
      )
$$;

drop policy if exists vpv_share_links_select on public.share_links;
create policy vpv_share_links_select_open on public.share_links for select to anon, authenticated using (true);
grant select on public.share_links to anon;

commit;
