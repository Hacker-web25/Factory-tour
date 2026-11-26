-- What a brand-new Supabase project looks like to the restore: an `extensions`
-- schema, an `auth` schema with its (empty) tables, the usual roles, an empty
-- public schema. A simplified GoTrue schema: same kinds of objects (an enum, a
-- generated column, foreign keys, a function other schemas use), not every column.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create schema if not exists auth;
create type auth.aal_level as enum ('aal1', 'aal2', 'aal3');
create table auth.users (
  id uuid primary key,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz default now()
);
create table auth.identities (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  identity_data jsonb not null,
  created_at timestamptz default now()
);
create table auth.mfa_factors (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  friendly_name text,
  factor_type text not null,
  secret text
);
create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  aal auth.aal_level,
  created_at timestamptz default now()
);
create table auth.schema_migrations (version varchar(255) primary key);
insert into auth.schema_migrations values ('20240101000000');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase's storage schema (simplified): bucket definitions and the files table.
create schema if not exists storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
alter table storage.objects enable row level security;
