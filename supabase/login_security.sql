-- ========================================================================
--  Login security — rate limiting, device enforcement, bulk invite codes.
--
--  Adds / extends:
--    - invite_codes.device_limit        (per-code device cap, default 1)
--    - profiles.mobile_number, invited_via_code, device_limit
--    - active_sessions                  (one row per user × device fingerprint)
--    - login_attempts                   (used by rate-limit RPC)
--    - RPC: check_login_rate_limit, record_login_attempt,
--           claim_device_slot, release_device_slot, is_new_device
--
--  Device enforcement rule:
--    A user can have at most profiles.device_limit active sessions
--    (default 1). A session is "active" if last_seen_at is within the
--    last 30 minutes. When a slot is full, a new login is REJECTED
--    with status='full'. If the user signs out on the other device,
--    or that session idles out after 30 minutes, the slot frees up.
--
--  Rate-limit rule:
--    5 failed login attempts within 15 min → locked for 15 min from
--    the latest failure. A successful attempt doesn't reset the
--    counter directly, but the check only counts FAILED attempts, so
--    a successful login effectively lets the user back in.
-- ========================================================================

-- 1. Bulk invite codes already use max_uses + used_count + used_by[].
--    Add a per-code device_limit that cascades to profiles on redeem.
alter table public.invite_codes
  add column if not exists device_limit integer not null default 1;

-- 2. Profile columns needed for sales-team signup + device enforcement.
alter table public.profiles
  add column if not exists mobile_number    text,
  add column if not exists invited_via_code text,
  add column if not exists device_limit     integer not null default 1;

-- 3. Active sessions — one row per (user, device fingerprint).
create table if not exists public.active_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  device_fingerprint text not null,
  user_agent         text,
  ip_country         text,
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create unique index if not exists active_sessions_unique_user_fp
  on public.active_sessions (user_id, device_fingerprint);
create index if not exists active_sessions_user_idx
  on public.active_sessions (user_id);

-- RLS: user sees + revokes only their own rows. Writes always go
-- through the security-definer RPC claim_device_slot, so no
-- INSERT/UPDATE policies are needed.
alter table public.active_sessions enable row level security;
drop policy if exists "self-read"   on public.active_sessions;
drop policy if exists "self-delete" on public.active_sessions;
create policy "self-read"   on public.active_sessions
  for select using (user_id = auth.uid());
create policy "self-delete" on public.active_sessions
  for delete using (user_id = auth.uid());

-- 4. Login attempts — pre-auth writes, RLS-locked reads.
create table if not exists public.login_attempts (
  id          bigserial primary key,
  email       text not null,
  success     boolean not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists login_attempts_email_time
  on public.login_attempts (email, created_at desc);

alter table public.login_attempts enable row level security;
drop policy if exists "no-direct-read" on public.login_attempts;
create policy "no-direct-read" on public.login_attempts for select using (false);

-- 5. RPC — check the rate-limit state for an email.
--    Returns one row: (locked, locked_until, failed_recent).
create or replace function public.check_login_rate_limit(p_email text)
returns table (locked boolean, locked_until timestamptz, failed_recent int)
language plpgsql security definer set search_path = public as $$
declare
  v_email  text := lower(trim(p_email));
  v_recent int;
  v_latest timestamptz;
begin
  select count(*), max(created_at)
    into v_recent, v_latest
  from public.login_attempts
  where email      = v_email
    and success    = false
    and created_at > now() - interval '15 minutes';

  if v_recent >= 5 then
    return query select true, v_latest + interval '15 minutes', v_recent;
  else
    return query select false, null::timestamptz, v_recent;
  end if;
end;
$$;
grant execute on function public.check_login_rate_limit(text)
  to anon, authenticated;

-- 6. RPC — record one login attempt + housekeep old rows.
create or replace function public.record_login_attempt(
  p_email      text,
  p_success    boolean,
  p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  insert into public.login_attempts (email, success, user_agent)
  values (v_email, p_success, p_user_agent);

  -- Keep only the last 30 days per email, so the table never grows forever.
  delete from public.login_attempts
   where email      = v_email
     and created_at < now() - interval '30 days';
end;
$$;
grant execute on function public.record_login_attempt(text, boolean, text)
  to anon, authenticated;

-- 7. RPC — claim a device slot for the authenticated user.
--    Returns (status, active_count, device_limit) where status is one
--    of 'unauth' | 'ok' | 'full'. Called by the login flow right after
--    a successful Supabase signInWithPassword. On 'full' the caller
--    must sign the user back out and show the "device limit hit" UX.
create or replace function public.claim_device_slot(
  p_fingerprint text,
  p_user_agent  text default null,
  p_country     text default null
) returns table (status text, active_count int, device_limit int)
language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_limit int;
  v_count int;
begin
  if v_user is null then
    return query select 'unauth'::text, 0, 1; return;
  end if;

  select coalesce(device_limit, 1) into v_limit
    from public.profiles where id = v_user;
  v_limit := coalesce(v_limit, 1);

  -- Already-registered device → bump heartbeat and return ok.
  if exists (
    select 1 from public.active_sessions
     where user_id = v_user and device_fingerprint = p_fingerprint
  ) then
    update public.active_sessions
       set last_seen_at = now(),
           user_agent   = coalesce(p_user_agent, user_agent),
           ip_country   = coalesce(p_country, ip_country)
     where user_id = v_user and device_fingerprint = p_fingerprint;
    select count(*) into v_count
      from public.active_sessions where user_id = v_user;
    return query select 'ok'::text, v_count, v_limit; return;
  end if;

  -- New device → count only ACTIVE sessions (last 30 min).
  select count(*) into v_count
    from public.active_sessions
   where user_id = v_user
     and last_seen_at > now() - interval '30 minutes';

  if v_count < v_limit then
    insert into public.active_sessions
      (user_id, device_fingerprint, user_agent, ip_country)
      values (v_user, p_fingerprint, p_user_agent, p_country);
    return query select 'ok'::text, v_count + 1, v_limit; return;
  end if;

  -- Still full? Purge truly idle rows and recount — if any have
  -- idled past 30 min the slot frees up.
  delete from public.active_sessions
   where user_id = v_user
     and last_seen_at < now() - interval '30 minutes';
  select count(*) into v_count
    from public.active_sessions where user_id = v_user;

  if v_count < v_limit then
    insert into public.active_sessions
      (user_id, device_fingerprint, user_agent, ip_country)
      values (v_user, p_fingerprint, p_user_agent, p_country);
    return query select 'ok'::text, v_count + 1, v_limit; return;
  end if;

  return query select 'full'::text, v_count, v_limit;
end;
$$;
grant execute on function public.claim_device_slot(text, text, text)
  to authenticated;

-- 8. RPC — release a device slot on explicit sign-out.
create or replace function public.release_device_slot(p_fingerprint text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  delete from public.active_sessions
   where user_id = v_user and device_fingerprint = p_fingerprint;
end;
$$;
grant execute on function public.release_device_slot(text) to authenticated;

-- 9. RPC — "has this user ever logged in from this fingerprint?"
--    Used to decide whether to send the new-device-login email.
--    MUST be called BEFORE claim_device_slot (which inserts the row).
create or replace function public.is_new_device(p_fingerprint text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;
  return not exists (
    select 1 from public.active_sessions
     where user_id = v_user and device_fingerprint = p_fingerprint
  );
end;
$$;
grant execute on function public.is_new_device(text) to authenticated;
