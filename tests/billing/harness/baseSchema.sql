-- Minimal stand-in for the parts of a Supabase project the billing code
-- depends on. The REAL migrations (plan_tiers, rate_limits_and_audit,
-- billing, billing_hardening) are applied on top of this, unchanged.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema if not exists auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  last_sign_in_at    timestamptz
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  plan       text not null default 'pro',
  created_at timestamptz not null default now(),
  constraint organizations_plan_check check (plan in ('pro', 'ultra'))
);

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'presenter',
  org_id     uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Sales Team invite codes (the real table is created outside these migrations).
create table public.invite_codes (
  code        text primary key,
  org_id      uuid references public.organizations(id) on delete cascade,
  created_by  uuid,
  max_uses    integer,
  used_count  integer not null default 0,
  used_by     text[] not null default '{}',
  expires_at  timestamptz,
  device_limit integer not null default 1
);

create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  presenter_user_id uuid not null,
  org_id            uuid,
  name              text
);

create table public.share_links (
  id              uuid primary key default gen_random_uuid(),
  tour_id         uuid not null,
  token           text not null,
  kind            text not null default 'viewer',
  password_hash   text,
  require_email   boolean not null default false,
  expires_at      timestamptz,
  view_limit      integer,
  device_limit    integer,
  session_minutes integer,
  used            boolean not null default false,
  revoked_at      timestamptz
);

create table public.tours (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations(id) on delete cascade,
  name       text
);

create table public.scenes (
  id          uuid primary key default gen_random_uuid(),
  tour_id     uuid not null references public.tours(id) on delete cascade,
  order_index integer not null default 0,
  name        text
);

grant usage on schema public to anon, authenticated, service_role;
