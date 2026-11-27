-- VPV Premium gets every link control (27 Nov 2026).
--
-- VPV Ultra was folded into VPV Premium: Premium now has everything Ultra had,
-- so `org_link_controls` must say that Premium has all four link controls
-- (one-time, password, expiry time, device limit and the e-mail gate that goes
-- with it). Without this, the `share_links_enforce_plan` trigger would still
-- refuse a Premium workspace that sets a password, an expiry or a device limit.
-- Must match linkControls in lib/pricing.ts. The free salesperson dashboard and
-- the free yearly update shoot are counted in code (includedSalesLogins,
-- updateShoots), not here.
--
-- THIS FILE REPLACES supabase/ultra_perks.sql, an earlier version of this change
-- (it gave Ultra the controls) that has been removed from the repo. Run this one.
-- If ultra_perks.sql was already run, run this too: it is the newer rule and is
-- safe on top of it.
--
-- supabase/plans_yearly.sql carries these same two functions, so running it
-- again does not undo this. A database that already ran plans_yearly.sql needs
-- only this file. Safe to run more than once; it only widens what Premium may
-- do (the live database had no Premium or Ultra workspace when this was
-- written, so nobody's access changes today).

create or replace function public.org_link_controls(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      -- Premium has every link control since 27 Nov 2026 (VPV Ultra was folded into
      -- it). 'ultra' stays listed: an id that was never sold, but must not lose a control.
      when o.plan in ('pro', 'ultra') or o.site_plan in ('premium', 'ultra', 'white_glove', 'control', 'enterprise')
        then '{"oneTime": true, "password": true, "expiry": true, "devices": true}'::jsonb
      else '{"oneTime": false, "password": false, "expiry": false, "devices": false}'::jsonb
    end
      from public.organizations o where o.id = p_org
  ), '{"oneTime": false, "password": false, "expiry": false, "devices": false}'::jsonb);
$$;
grant execute on function public.org_link_controls(uuid) to anon, authenticated;

create or replace function public.share_links_enforce_plan()
returns trigger
language plpgsql
-- NOT security definer: it must see who is really asking (current_user).
set search_path = public
as $$
declare
  j     jsonb := to_jsonb(new);
  o     jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_org uuid;
  have  jsonb;
  need  text;
  col   text;
  setting boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.vpv_caller_is_owner() then
    return new;
  end if;
  if coalesce(j->>'kind', 'viewer') = 'presenter' then
    return new;
  end if;
  v_org := public.tour_org_of((j->>'tour_id')::uuid);
  if v_org is null then
    return new;
  end if;
  have := public.org_link_controls(v_org);
  foreach col in array array['view_limit', 'session_minutes', 'password_hash', 'expires_at', 'device_limit', 'require_email'] loop
    setting := (j->>col) is not null
               and not (col = 'require_email' and coalesce((j->>col)::boolean, false) = false)
               and (j->>col) is distinct from (o->>col);
    if setting then
      need := case col
        when 'view_limit' then 'oneTime'
        when 'session_minutes' then 'oneTime'
        when 'password_hash' then 'password'
        when 'expires_at' then 'expiry'
        else 'devices'
      end;
      if coalesce((have->>need)::boolean, false) = false then
        raise exception 'sharing_controls_need_control'
          using hint = case need
            when 'oneTime' then 'One-time view links start with VPV Premium.'
            when 'password' then 'Password-protected links start with VPV Premium.'
            when 'expiry' then 'Link expiry time starts with VPV Premium.'
            else 'Device limits and the e-mail gate start with VPV Premium.'
          end,
          errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
