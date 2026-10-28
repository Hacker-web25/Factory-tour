-- ============================================================================
-- security_phase3a_additive.sql — share-link / unlisted-tour access moves into the database.
-- Purely ADDITIVE: nothing is removed or tightened, so it is safe to run before the app that uses it.
-- ============================================================================
--
-- ROLL-OUT ORDER
--     3a  this file                                   (adds functions / columns; changes no behaviour)
--     deploy the app version that sends the viewer headers and calls these functions
--     3b  security_phase3b_lockdown.sql               (the database starts enforcing; share_links closed)
--
-- WHY (security review, 28 Oct 2026)
--   • Every share link's token and password hash were READABLE with the public key, and every gate on a
--     link (password, e-mail, expiry, device limit) was checked in the visitor's browser.  A visitor could
--     skip the gate by reading the tour straight from the API.
--   • Any tour marked "unlisted" could be listed by anyone, with its plain-text password.
--
-- HOW IT WORKS (after 3b)
--   The viewer sends small request headers with every data call:
--        x-view-tour   the tour id in the address bar      (unlisted tours)
--        x-tour-grant  proof the password was entered      (unlisted tours with a password)
--        x-share-token the link token                      (share links)
--        x-share-grant proof the link password was entered (links with a password)
--        x-viewer-fp / x-viewer-email   device id / e-mail (device limit / e-mail gate)
--   A "grant" is an HMAC only the database can make (secret in vpv_secrets).  It is handed out by
--   share_link_unlock / tour_unlock, which rate-limit wrong passwords, so the password cannot be guessed
--   through the data API.  Tours and links cannot be listed: the token / id has to be supplied.
-- ============================================================================

begin;

-- columns the one-time-link code (components/builder/ShareModal.tsx, app/tour/[id]/page.tsx) already writes
-- but that were never created, so "one-time link" failed on insert in production.
alter table public.share_links add column if not exists used_at timestamptz;
alter table public.share_links add column if not exists session_minutes integer
  check (session_minutes is null or session_minutes between 1 and 1440);

-- ── server-only secret + attempt log (no policies, no grants: only SECURITY DEFINER code touches them) ──
create table if not exists public.vpv_secrets (
  name  text primary key,
  value text not null
);
alter table public.vpv_secrets enable row level security;
revoke all on public.vpv_secrets from public, anon, authenticated;
insert into public.vpv_secrets (name, value)
values ('share_grant_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create table if not exists public.vpv_unlock_attempts (
  id    bigserial primary key,
  scope text        not null,
  key   text        not null,
  at    timestamptz not null default now()
);
create index if not exists vpv_unlock_attempts_lookup on public.vpv_unlock_attempts (scope, key, at desc);
alter table public.vpv_unlock_attempts enable row level security;
revoke all on public.vpv_unlock_attempts from public, anon, authenticated;

-- ── helpers ─────────────────────────────────────────────────────────────────

-- A request header sent by the browser (PostgREST exposes them as JSON in request.headers).
create or replace function public.vpv_hdr(p_name text)
returns text language sql stable set search_path = public as
$$
  select nullif(
    (coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json) ->> lower(p_name),
    '')
$$;

-- Proof of a correct password: an HMAC only this database can produce.
create or replace function public.vpv_grant(p_scope text, p_a text, p_b text)
returns text language sql stable security definer set search_path = public, extensions as
$$
  select encode(
    extensions.hmac(
      p_scope || ':' || coalesce(p_a, '') || ':' || coalesce(p_b, ''),
      (select value from public.vpv_secrets where name = 'share_grant_key'),
      'sha256'),
    'hex')
$$;
revoke all on function public.vpv_grant(text, text, text) from public, anon, authenticated;

-- 8 wrong passwords per link / tour per 10 minutes, then it refuses until the window passes.
create or replace function public.vpv_attempts_ok(p_scope text, p_key text)
returns boolean language sql stable security definer set search_path = public as
$$
  select count(*) < 8 from public.vpv_unlock_attempts
   where scope = p_scope and key = p_key and at > now() - interval '10 minutes'
$$;
create or replace function public.vpv_attempt_failed(p_scope text, p_key text)
returns void language plpgsql security definer set search_path = public as
$$
begin
  insert into public.vpv_unlock_attempts (scope, key) values (p_scope, p_key);
  delete from public.vpv_unlock_attempts where at < now() - interval '1 day';
end;
$$;
revoke all on function public.vpv_attempts_ok(text, text)     from public, anon, authenticated;
revoke all on function public.vpv_attempt_failed(text, text)  from public, anon, authenticated;

-- May this device (fingerprint) open a link with a device limit?
create or replace function public.vpv_device_ok(p_link uuid, p_limit integer, p_fp text)
returns boolean language sql stable security definer set search_path = public as
$$
  select p_limit is null or p_limit <= 0 or coalesce((
    select coalesce(bool_or(te.viewer_fingerprint is not null and te.viewer_fingerprint = p_fp), false)
        or count(distinct te.viewer_fingerprint) filter (where te.viewer_fingerprint is not null) < p_limit
      from public.tour_events te
     where te.share_link_id = p_link
  ), true)
$$;
revoke all on function public.vpv_device_ok(uuid, integer, text) from public, anon, authenticated;

-- Does the share link named in the request headers allow reading this tour right now?
-- (Used by vpv_tour_visible once 3b is applied.)
create or replace function public.vpv_link_allows_read(p_tour uuid)
returns boolean language sql stable security definer set search_path = public as
$$
  select public.vpv_hdr('x-share-token') is not null and exists (
    select 1 from public.share_links sl
     where sl.tour_id = p_tour
       and sl.token = public.vpv_hdr('x-share-token')
       and sl.revoked_at is null
       and (sl.expires_at is null or sl.expires_at > now())
       and (sl.view_limit is null or coalesce(sl.view_count, 0) <= sl.view_limit)
       and (
            case when sl.kind = 'presenter' then
                   -- a presenter link works only for the person it was made for
                   auth.uid() is not null and sl.owner_user_id = auth.uid()
                 else
                   (sl.password_hash is null
                      or public.vpv_hdr('x-share-grant') = public.vpv_grant('link', sl.id::text, sl.password_hash))
                   and (not coalesce(sl.require_email, false)
                        or position('@' in coalesce(public.vpv_hdr('x-viewer-email'), '')) > 1)
                   and public.vpv_device_ok(sl.id, sl.device_limit, public.vpv_hdr('x-viewer-fp'))
            end
       )
  )
$$;
revoke all on function public.vpv_link_allows_read(uuid) from public, anon, authenticated;

-- ── what the browser may ask ────────────────────────────────────────────────

-- Look a link up by its token.  Returns the link WITHOUT the password hash or recipient details, plus
-- the reason it cannot be opened (same wording the app used to compute in the browser).
create or replace function public.share_link_lookup(p_token text, p_fp text default null)
returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare
  sl      public.share_links;
  blocked text;
  seen    bigint;
  mine    boolean;
begin
  if p_token is null or length(p_token) < 8 then return null; end if;
  select * into sl from public.share_links where token = p_token;
  if not found then return null; end if;

  if sl.revoked_at is not null then
    blocked := 'This link has been revoked.';
  elsif sl.expires_at is not null and sl.expires_at < now() then
    blocked := 'This link has expired.';
  elsif sl.view_limit is not null and coalesce(sl.view_count, 0) >= sl.view_limit then
    blocked := 'This link has reached its view limit.';
  elsif sl.device_limit is not null and sl.device_limit > 0 then
    select count(distinct te.viewer_fingerprint) filter (where te.viewer_fingerprint is not null),
           coalesce(bool_or(te.viewer_fingerprint is not null and te.viewer_fingerprint = p_fp), false)
      into seen, mine
      from public.tour_events te
     where te.share_link_id = sl.id;
    if seen >= sl.device_limit and not mine then
      blocked := format('This link is limited to %s %s and that limit has been reached.',
                        sl.device_limit, case when sl.device_limit = 1 then 'device' else 'devices' end);
    end if;
  end if;

  return jsonb_build_object(
    'link', (to_jsonb(sl) - 'password_hash' - 'shared_to_email' - 'shared_to_phone')
            || jsonb_build_object('has_password', sl.password_hash is not null),
    'blocked', blocked,
    'org_id', (select t.org_id from public.tours t where t.id = sl.tour_id));
end;
$$;

-- Check a link password (the browser sends sha256(password), as it always did).
create or replace function public.share_link_unlock(p_token text, p_proof text)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare sl public.share_links;
begin
  select * into sl from public.share_links where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if sl.password_hash is not null then
    if not public.vpv_attempts_ok('link', sl.id::text) then
      return jsonb_build_object('ok', false, 'error', 'locked');
    end if;
    if p_proof is distinct from sl.password_hash then
      perform public.vpv_attempt_failed('link', sl.id::text);
      return jsonb_build_object('ok', false, 'error', 'wrong_password');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'grant', public.vpv_grant('link', sl.id::text, sl.password_hash));
end;
$$;

-- Does an unlisted tour need a password?  (Answerable without being able to read the tour.)
create or replace function public.tour_gate_info(p_tour uuid)
returns jsonb language sql stable security definer set search_path = public as
$$
  select coalesce((
    select jsonb_build_object(
             'visibility', coalesce(t.visibility, case when coalesce(t.published, false) then 'public' else 'private' end),
             'needs_password', coalesce(t.visibility, 'private') = 'unlisted' and nullif(t.unlisted_password, '') is not null,
             'title', case when coalesce(t.visibility, 'private') = 'unlisted' then t.title end)
      from public.tours t where t.id = p_tour
  ), jsonb_build_object('visibility', 'none', 'needs_password', false))
$$;

create or replace function public.tour_unlock(p_tour uuid, p_password text)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare t public.tours;
begin
  select * into t from public.tours where id = p_tour;
  if not found or coalesce(t.visibility, 'private') <> 'unlisted' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if nullif(t.unlisted_password, '') is null then
    return jsonb_build_object('ok', true, 'grant', public.vpv_grant('tour', t.id::text, null));
  end if;
  if not public.vpv_attempts_ok('tour', t.id::text) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if p_password is distinct from t.unlisted_password then
    perform public.vpv_attempt_failed('tour', t.id::text);
    return jsonb_build_object('ok', false, 'error', 'wrong_password');
  end if;
  return jsonb_build_object('ok', true, 'grant', public.vpv_grant('tour', t.id::text, t.unlisted_password));
end;
$$;

-- One-time (?token=) links: consume atomically on the server instead of an UPDATE from the browser.
create or replace function public.consume_one_time_link(p_tour uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare sl public.share_links;
begin
  update public.share_links
     set used = true, used_at = now()
   where tour_id = p_tour and token = p_token
     and coalesce(used, false) = false
     and revoked_at is null
     and (expires_at is null or expires_at > now())
  returning * into sl;
  if found then
    return jsonb_build_object('status', 'consumed', 'session_minutes', sl.session_minutes);
  end if;

  select * into sl from public.share_links where tour_id = p_tour and token = p_token;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if sl.revoked_at is not null or (sl.expires_at is not null and sl.expires_at <= now()) then
    return jsonb_build_object('status', 'expired');
  end if;
  if sl.session_minutes is not null and sl.used_at is not null then
    if now() < sl.used_at + make_interval(mins => sl.session_minutes) then
      return jsonb_build_object('status', 'in_session',
        'session_minutes', sl.session_minutes,
        'expires_at', sl.used_at + make_interval(mins => sl.session_minutes));
    end if;
    return jsonb_build_object('status', 'session_over');
  end if;
  return jsonb_build_object('status', 'used');
end;
$$;

revoke all on function public.share_link_lookup(text, text)       from public;
revoke all on function public.share_link_unlock(text, text)       from public;
revoke all on function public.tour_gate_info(uuid)                from public;
revoke all on function public.tour_unlock(uuid, text)             from public;
revoke all on function public.consume_one_time_link(uuid, text)   from public;
grant execute on function public.share_link_lookup(text, text)     to anon, authenticated, service_role;
grant execute on function public.share_link_unlock(text, text)     to anon, authenticated, service_role;
grant execute on function public.tour_gate_info(uuid)              to anon, authenticated, service_role;
grant execute on function public.tour_unlock(uuid, text)           to anon, authenticated, service_role;
grant execute on function public.consume_one_time_link(uuid, text) to anon, authenticated, service_role;
grant execute on function public.vpv_hdr(text)                     to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
