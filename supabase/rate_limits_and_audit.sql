-- ========================================================================
--  Generalised rate limiter + security audit log.
--
--  Why one SQL file:
--    This is the backstop that protects every pre-auth and auth-adjacent
--    endpoint — share-link brute force, signup abuse, mass invite-code
--    guessing, API spam. The LOGIN flow has its own dedicated limiter
--    (login_security.sql); this one covers everything else.
--
--  Design:
--    `rate_limits` is a tiny table keyed by (key, window_start). Each key
--    is a composite the caller picks, e.g. "notify-new-device:ip:1.2.3.4"
--    or "signup:ip:1.2.3.4". The RPC rounds the current time down to the
--    window boundary, upserts the row with a +1 counter, and returns
--    whether the counter is still under the configured ceiling.
--
--    Old rows are purged opportunistically on every call (cheap), so the
--    table never grows without bound.
--
--  Audit log:
--    `security_audit_log` captures the sensitive events we actually care
--    about: password changes, invite-code generation, device-slot
--    revocation, blocked share-link attempts. Admins read it from the
--    dashboard; the row-level policies keep it scoped per-org.
-- ========================================================================

-- 1. Rate-limit storage.
create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx
  on public.rate_limits (window_start);

-- RLS: NO direct reads/writes from anon or authenticated. Only the
-- security-definer RPC may touch this table.
alter table public.rate_limits enable row level security;
drop policy if exists "no-direct-read"  on public.rate_limits;
drop policy if exists "no-direct-write" on public.rate_limits;
create policy "no-direct-read"  on public.rate_limits for select using (false);
create policy "no-direct-write" on public.rate_limits for all    using (false) with check (false);

-- 2. The limiter RPC.
--    Returns (allowed, remaining, retry_after_seconds).
--    Allowed=false → block, show the retry_after countdown.
create or replace function public.check_and_bump_rate(
  p_key            text,
  p_max            integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql security definer set search_path = public as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  if coalesce(p_max, 0) <= 0 or coalesce(p_window_seconds, 0) <= 0 then
    return query select true, 0, 0; return;
  end if;

  -- Snap to the start of the current window so one key accumulates one
  -- row per window instead of a smear of near-identical timestamps.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (key, window_start, count)
       values (p_key, v_window_start, 1)
  on conflict (key, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Housekeep — any row older than ~24h is dead weight, delete a slice
  -- opportunistically. Cheap; indexed on window_start.
  delete from public.rate_limits
   where window_start < now() - interval '24 hours';

  if v_count > p_max then
    return query select
      false,
      0,
      greatest(1, p_window_seconds -
        cast(extract(epoch from now() - v_window_start) as integer));
    return;
  end if;

  return query select true, p_max - v_count, 0;
end;
$$;

grant execute on function public.check_and_bump_rate(text, integer, integer)
  to anon, authenticated;

-- 3. Security audit log.
create table if not exists public.security_audit_log (
  id         bigserial primary key,
  org_id     uuid references public.organizations(id) on delete set null,
  actor_id   uuid references auth.users(id) on delete set null,
  event      text not null,
  subject    text,
  meta       jsonb not null default '{}'::jsonb,
  ip         inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists security_audit_org_time
  on public.security_audit_log (org_id, created_at desc);
create index if not exists security_audit_event_time
  on public.security_audit_log (event, created_at desc);

alter table public.security_audit_log enable row level security;
drop policy if exists "org-read"       on public.security_audit_log;
drop policy if exists "no-direct-ins"  on public.security_audit_log;
-- Members of the org can READ their org's audit entries. Only the
-- security-definer RPC writes.
create policy "org-read" on public.security_audit_log
  for select
  using (
    org_id in (select org_id from public.profiles where id = auth.uid())
  );
create policy "no-direct-ins" on public.security_audit_log
  for insert with check (false);

-- 4. Log writer. Called from server-side route handlers.
create or replace function public.log_security_event(
  p_event      text,
  p_org_id     uuid default null,
  p_subject    text default null,
  p_meta       jsonb default '{}'::jsonb,
  p_ip         text default null,
  p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.security_audit_log
    (org_id, actor_id, event, subject, meta, ip, user_agent)
  values (
    p_org_id,
    auth.uid(),
    p_event,
    p_subject,
    coalesce(p_meta, '{}'::jsonb),
    nullif(p_ip, '')::inet,
    p_user_agent
  );
end;
$$;

grant execute on function public.log_security_event(text, uuid, text, jsonb, text, text)
  to anon, authenticated;

-- 5. RLS production-readiness check.
--    Run this manually any time. Returns the list of public tables
--    that DON'T have RLS enabled — those are the ones that need
--    hardening before launch.
--
--    SELECT * FROM public.rls_review();
create or replace function public.rls_review()
returns table (table_name text, rls_enabled boolean, policy_count integer)
language sql security definer set search_path = public as $$
  select
    c.relname::text,
    c.relrowsecurity,
    (select count(*)::int from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not like 'pg_%'
  order by c.relrowsecurity asc, c.relname;
$$;

grant execute on function public.rls_review() to authenticated;
