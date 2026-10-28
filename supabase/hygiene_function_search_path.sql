-- ============================================================================
-- hygiene_function_search_path.sql — pin the schema search path of 8 trigger/helper functions.
-- APPLIED to production on 28 Oct 2026 (run as a one-off statement; this file is the record).
-- ============================================================================
--
-- Supabase's security advisor flagged these functions as "function_search_path_mutable": they did not
-- fix which schemas they search, so a caller who can create objects in another schema on the search
-- path could in principle shadow a table or operator they use.  None of them is callable to do harm
-- today (they are triggers or pure helpers), so this is defence in depth — it changes no behaviour.
--
-- Safe to re-run.  Rollback: alter function <name> reset search_path;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('set_client_updated_at', 'funnel_leads_touch', 'vpv_financial_year', 'vpv_support_nag_days',
                         'billing_invoice_frozen', 'billing_ledger_no_delete', 'billing_credit_note_frozen',
                         'vpv_reminder_kind')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;
