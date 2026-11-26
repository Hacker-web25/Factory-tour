-- A pretend production database: logins, a profile per login (made by a trigger
-- on auth.users, like the real site), row level security, functions, grants,
-- awkward text. Everything the backup must carry and the restore must rebuild.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'member' check (role in ('member', 'admin', 'owner')),
  display_name text,
  created_at timestamptz not null default now()
);
create table public.organisations (
  id uuid primary key default extensions.uuid_generate_v4(),
  name text not null,
  plan text not null default 'free',
  settings jsonb not null default '{}',
  logo bytea,
  tags text[] not null default '{}',
  name_len int generated always as (length(name)) stored,
  created_at timestamptz not null default now()
);
create table public.leads (
  id bigint generated always as identity primary key,
  org_id uuid references public.organisations(id),
  note text,
  amount numeric(12,2),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.empty_table (id int primary key);
create table "public"."Mixed Case Table" ("Odd Column" text);
create index leads_org_idx on public.leads (org_id);
create view public.org_summary as select o.id, o.name, count(l.id) as leads from public.organisations o left join public.leads l on l.org_id = o.id group by o.id, o.name;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name) values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') $$;

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
create policy profiles_self on public.profiles for select using (id = auth.uid() or public.is_owner());
create policy leads_owner_all on public.leads for all using (public.is_owner()) with check (public.is_owner());
revoke all on public.profiles, public.leads, public.organisations from anon;
grant select on public.profiles to authenticated;
grant all on public.leads, public.organisations to service_role;
grant select on public.org_summary to authenticated;

-- 11 logins; the trigger creates the 11 profiles
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, is_super_admin)
select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'user' || i || '@example.com', '$2a$10$hash' || i, now(), jsonb_build_object('n', i, 'quote', 'it''s "fine"'), i = 1
  from generate_series(1, 11) i;
insert into auth.identities (id, user_id, provider, identity_data)
select ('10000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'email', jsonb_build_object('email', 'user' || i || '@example.com')
  from generate_series(1, 11) i;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, secret)
values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'phone', 'totp', 'SECRETBASE32');
insert into auth.sessions (id, user_id, aal) values ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'aal1');
update public.profiles set role = 'owner' where id = '00000000-0000-4000-8000-000000000001';

insert into public.organisations (name, plan, settings, logo, tags)
select 'Org ' || i || case when i % 3 = 0 then E' — "quoted" it''s\nnewline 日本語 😀' else '' end, (array['free','pro','scale'])[1 + i % 3], jsonb_build_object('seats', i, 'nested', jsonb_build_object('a', array[1,2,3])), decode(md5(i::text), 'hex'), array['a', 'b' || i]
  from generate_series(1, 12) i;
insert into public.leads (org_id, note, amount, created_by)
select (select id from public.organisations order by name limit 1 offset (i % 12)), 'lead ' || i || repeat('x', i * 10), i * 1.25, ('00000000-0000-4000-8000-' || lpad((1 + i % 11)::text, 12, '0'))::uuid
  from generate_series(1, 300) i;
insert into public."Mixed Case Table" values ('semi;colon'), (null);
-- pad it so the dump is a realistic size
create table public.padding as select i, md5(i::text) || md5((i * 7)::text) as filler from generate_series(1, 4000) i;

-- storage buckets and access rules
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('panoramas', 'panoramas', true, 209715200, null),
  ('recordings', 'recordings', false, 209715200, '{audio/webm,audio/mp4}'),
  ('voice-samples', 'voice-samples', false, null, null);
create policy "voice sample: owner read" on storage.objects for select to authenticated using (bucket_id = 'voice-samples' and (storage.objects.name like (auth.uid()::text || '/%')));
create policy "vpv_panoramas_insert" on storage.objects for insert to public with check (bucket_id = 'panoramas');
create policy "vpv_everything_for_owner" on storage.objects as permissive for all to authenticated, service_role using (public.is_owner()) with check (public.is_owner());
create policy "vpv_no_anon_recordings" on storage.objects as restrictive for select to anon using (bucket_id <> 'recordings');
