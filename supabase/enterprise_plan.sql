-- VPV Enterprise, and the plant size a buyer gives.
--
--   1. funnel_leads.recommended_plan / chosen_plan may now be 'enterprise'.
--   2. funnel_leads.plot_size records the plant size band the visitor chose
--      (upto200 / upto600 / upto1000 / above1000), for the rep's call.
--
-- Nothing else needs changing: an Enterprise purchase is stored as an
-- ordinary basic_licence order, exactly like Confidence, Authority and Control.
--
-- Until this is run, the website still works: the lead note is simply saved
-- without the plot size and without an "enterprise" plan name.
-- Safe to run more than once.

alter table public.funnel_leads
  drop constraint if exists funnel_leads_recommended_plan_check,
  drop constraint if exists funnel_leads_chosen_plan_check;

alter table public.funnel_leads
  add constraint funnel_leads_recommended_plan_check
    check (recommended_plan is null or recommended_plan in ('confidence','authority','control','enterprise')),
  add constraint funnel_leads_chosen_plan_check
    check (chosen_plan is null or chosen_plan in ('confidence','authority','control','enterprise'));

alter table public.funnel_leads
  add column if not exists plot_size text
    check (plot_size is null or plot_size in ('upto200','upto600','upto1000','above1000'));

comment on column public.funnel_leads.plot_size is
  'Plant size band the visitor chose: upto200, upto600, upto1000 or above1000 (sq yards / gaj).';
