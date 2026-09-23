-- Qualification / intake leads captured from apply.myvpv.com
-- Row is INSERTed by the anon key from the public form.

create table if not exists qualification_leads (
  id                            uuid primary key default gen_random_uuid(),
  created_at                    timestamptz not null default now(),

  first_name                    text not null,
  last_name                     text not null,
  company_name                  text not null,
  mobile                        text not null,
  email                         text not null,

  industry                      text,
  factory_count                 text,
  current_export_turnover       text,
  export_goal_5yr               text,
  client_ltv_cr                 text,
  export_countries              text,

  intl_marketing_spend          text,
  exhibitions_5yr               text,
  sales_cycle_length            text,
  lead_conversion_rate          text,

  buyers_negotiate_price        text,
  buyers_understand_scale       text,
  competitive_positioning       text,
  trust_delays_deals            text,

  factory_showcase_method       text,
  followup_system               text,
  export_team                   text,
  virtual_audit_readiness       text,

  yoy_growth                    text,
  total_exhibition_investment   text,
  growth_initiatives            text,
  top_challenges                text,
  has_usp                       text,
  last_innovation               text,

  marketing_execution_pct       text,
  lost_revenue                  text,
  brutal_honesty                text,

  -- Which page the visitor came from, if any (for future utm parsing)
  referrer                      text,
  user_agent                    text
);

create index if not exists qualification_leads_created_at_idx
  on qualification_leads (created_at desc);

alter table qualification_leads enable row level security;

-- Only public role can INSERT (nobody can SELECT / UPDATE / DELETE from the
-- anon key). Super-owner reads via SQL editor or a future dashboard.
drop policy if exists "public may insert qualification leads" on qualification_leads;
create policy "public may insert qualification leads"
  on qualification_leads
  for insert
  to anon, authenticated
  with check (true);
