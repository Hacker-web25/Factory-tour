-- supabase/login_lockout_per_ip.sql  (16 Nov 2026)
--
-- WHY: the sign-in lockout (5 failed attempts in 15 minutes) was counted per
-- E-MAIL only, and record_login_attempt() is callable by anyone with the
-- public key. So a stranger could call it 5 times with the owner's e-mail
-- and keep the owner locked out of the login page indefinitely, without
-- knowing any password.
--
-- NOW: attempts are counted per e-mail AND per network address. Someone
-- guessing passwords from one address is still locked out after 5 tries;
-- someone trying to lock out a real user can only lock out themselves.
-- Supabase Auth's own rate limits and the Turnstile check still apply on top.
--
-- Also: one network address can record at most 50 attempts per 15 minutes,
-- so the table cannot be flooded through the public API.
--
-- Safe to run more than once. Run in the Supabase SQL editor after
-- login_security.sql and security_phase3a_additive.sql (it uses vpv_hdr()).

alter table public.login_attempts add column if not exists ip text;
create index if not exists login_attempts_email_ip_time
  on public.login_attempts (email, ip, created_at desc);
create index if not exists login_attempts_ip_time
  on public.login_attempts (ip, created_at desc);

-- The caller's network address as Supabase's API gateway reports it.
create or replace function public.vpv_request_ip()
returns text
language sql stable
set search_path = public
as $$
  select coalesce(
    nullif(trim(split_part(coalesce(public.vpv_hdr('x-forwarded-for'), ''), ',', 1)), ''),
    public.vpv_hdr('cf-connecting-ip'),
    public.vpv_hdr('x-real-ip'),
    ''
  )
$$;

create or replace function public.check_login_rate_limit(p_email text)
returns table (locked boolean, locked_until timestamptz, failed_recent int)
language plpgsql security definer set search_path = public as $$
declare
  v_email  text := lower(trim(p_email));
  v_ip     text := public.vpv_request_ip();
  v_recent int;
  v_latest timestamptz;
begin
  select count(*), max(created_at)
    into v_recent, v_latest
  from public.login_attempts
  where email      = v_email
    and coalesce(ip, '') = v_ip
    and success    = false
    and created_at > now() - interval '15 minutes';

  if v_recent >= 5 then
    return query select true, v_latest + interval '15 minutes', v_recent;
  else
    return query select false, null::timestamptz, v_recent;
  end if;
end;
$$;
grant execute on function public.check_login_rate_limit(text) to anon, authenticated;

create or replace function public.record_login_attempt(
  p_email      text,
  p_success    boolean,
  p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_ip    text := public.vpv_request_ip();
begin
  if v_email = '' or length(v_email) > 254 then
    return;
  end if;
  -- Flood brake: one address, at most 50 rows per 15 minutes.
  if (select count(*) from public.login_attempts
       where coalesce(ip, '') = v_ip and created_at > now() - interval '15 minutes') >= 50 then
    return;
  end if;

  insert into public.login_attempts (email, success, user_agent, ip)
  values (v_email, p_success, left(p_user_agent, 300), v_ip);

  delete from public.login_attempts
   where email      = v_email
     and created_at < now() - interval '30 days';
end;
$$;
grant execute on function public.record_login_attempt(text, boolean, text) to anon, authenticated;
