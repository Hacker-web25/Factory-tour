-- Test-only: mimic Supabase's default privileges and the existing (permissive)
-- row-level-security on tours/scenes, so the RESTRICTIVE lock policies from
-- billing_hardening.sql can be tested against something realistic.
grant usage on schema auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

alter table public.tours  enable row level security;
alter table public.scenes enable row level security;

drop policy if exists tours_all    on public.tours;
drop policy if exists scenes_read  on public.scenes;
drop policy if exists scenes_write on public.scenes;
create policy tours_all    on public.tours  for all    to anon, authenticated using (true) with check (true);
-- "anyone with a valid share link" can read scenes; members can write.
create policy scenes_read  on public.scenes for select to anon, authenticated using (true);
create policy scenes_write on public.scenes for all    to authenticated using (true) with check (true);

-- Organisations: the browser edits its own org (theme etc.). Model a policy as
-- permissive as production's might be: any org admin may UPDATE their own row,
-- any column. The trigger from billing_hardening.sql must still protect the plan.
alter table public.organizations add column if not exists theme jsonb not null default '{}'::jsonb;
alter table public.organizations enable row level security;
drop policy if exists orgs_read   on public.organizations;
drop policy if exists orgs_update on public.organizations;
drop policy if exists orgs_insert on public.organizations;
create policy orgs_read   on public.organizations for select to authenticated using (true);
create policy orgs_update on public.organizations for update to authenticated using (true) with check (true);
create policy orgs_insert on public.organizations for insert to authenticated with check (true);


-- Salespeople's client records: members of the workspace read and write their own.
alter table public.clients enable row level security;
drop policy if exists clients_all on public.clients;
create policy clients_all on public.clients for all to authenticated using (true) with check (true);

alter table public.share_links enable row level security;
drop policy if exists share_links_all on public.share_links;
create policy share_links_all on public.share_links for all to authenticated using (true) with check (true);
