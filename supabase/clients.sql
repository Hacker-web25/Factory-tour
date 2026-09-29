-- Client pipeline tracking.
--
-- A salesperson owns a list of clients they're pitching to. Each
-- presentation session can optionally link to a client, which lets the
-- MIS aggregate "how many times did we present to Acme Corp?", "what's
-- their pipeline stage?", "who closed how many deals?".
--
-- Statuses:
--   'active'       – added, not yet presented to (or in early dialogue)
--   'moved_ahead'  – had a real interaction, part of dealing has taken place
--   'closed'       – deal closed successfully
--   'lost'         – deal closed unsuccessfully
--
-- Only the presenter who owns the client (or their org_admin) can see /
-- edit it — RLS below.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

create table if not exists public.clients (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  presenter_user_id     uuid not null references public.profiles(id)      on delete cascade,

  -- Basic contact info.
  name                  text not null,
  company               text,
  email                 text,
  phone                 text,
  industry              text,
  notes                 text,

  -- Pipeline state.
  status                text not null default 'active'
                        check (status in ('active', 'moved_ahead', 'closed', 'lost')),
  estimated_value       numeric,
  actual_value          numeric,

  -- Follow-up.
  next_follow_up_at     timestamptz,

  -- Timestamps (auto-managed as state changes).
  first_presented_at    timestamptz,
  last_presented_at     timestamptz,
  moved_ahead_at        timestamptz,
  closed_at             timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists clients_presenter_idx  on public.clients (presenter_user_id, status);
create index if not exists clients_org_status_idx on public.clients (org_id, status);
create index if not exists clients_follow_up_idx  on public.clients (next_follow_up_at)
  where next_follow_up_at is not null and status in ('active', 'moved_ahead');

-- Link a presentation session to a client, so we can count sessions
-- per client and derive per-client viewing time.
alter table public.presentation_sessions
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists presentation_sessions_client_idx
  on public.presentation_sessions (client_id)
  where client_id is not null;

-- Auto-bump updated_at.
create or replace function public.set_client_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated on public.clients;
create trigger clients_set_updated
  before update on public.clients
  for each row execute function public.set_client_updated_at();

-- RLS: a presenter sees only their own clients; org_admin (and owner)
-- sees every client in their org.
alter table public.clients enable row level security;

drop policy if exists "clients_select_own_or_admin" on public.clients;
create policy "clients_select_own_or_admin" on public.clients
  for select using (
    presenter_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = clients.org_id
        and p.role in ('org_admin', 'owner')
    )
  );

drop policy if exists "clients_write_own" on public.clients;
create policy "clients_write_own" on public.clients
  for all using (presenter_user_id = auth.uid())
  with check (presenter_user_id = auth.uid());

drop policy if exists "clients_admin_write" on public.clients;
create policy "clients_admin_write" on public.clients
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = clients.org_id
        and p.role in ('org_admin', 'owner')
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = clients.org_id
        and p.role in ('org_admin', 'owner')
    )
  );

notify pgrst, 'reload schema';
