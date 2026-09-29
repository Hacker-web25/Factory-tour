-- Cross-tour navigation for hotspots.
--
-- A nav hotspot can point at a scene in ANOTHER tour, not just the
-- tour it lives in. When `nav_tour_id` is null (the default), the
-- hotspot navigates within the current tour — existing behaviour.
-- When set, the viewer first checks the current user's access to
-- that tour; if they don't have permission it shows an
-- access-denied message instead of navigating.
--
-- Run once in Supabase → SQL editor. Safe to re-run.

alter table public.hotspots
  add column if not exists nav_tour_id uuid;

-- No foreign-key constraint on purpose: a deleted target tour should
-- surface as "tour not found" at click time, not block deletes.

notify pgrst, 'reload schema';
