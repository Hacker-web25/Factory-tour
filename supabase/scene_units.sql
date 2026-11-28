-- Units: divider cards, unit codes and capture times on scenes.
--
-- Safe to run more than once. Every column is optional, so tours that already
-- exist behave exactly as before until someone uses the Units tool.
--
--   is_divider   true for a unit divider card (the white "KHOPOLI NUTRA UNIT"
--                picture). A divider is not an area: it is left out of the area
--                count and the auto-tour skips it.
--   unit_code    the short code used to number a unit's scenes, e.g. HO or R&D.
--                Stored on the divider scene of the unit.
--   captured_at  when the photo was taken (read from the picture itself when it
--                is uploaded). Used to work out which photos belong together.
--
-- A scene belongs to a unit through the existing `folder` column: every scene of
-- a unit, and its divider, carries the unit's title in `folder`.

alter table public.scenes add column if not exists is_divider  boolean not null default false;
alter table public.scenes add column if not exists unit_code   text;
alter table public.scenes add column if not exists captured_at timestamptz;

-- The viewer reads scenes through public_tour_scenes(), which returns
-- `setof scenes`, so the new columns reach the tour automatically.

comment on column public.scenes.is_divider  is 'Unit divider card. Not an area; skipped by the auto-tour.';
comment on column public.scenes.unit_code   is 'Short code used to number the unit''s scenes (HO, R&D). Set on the divider scene.';
comment on column public.scenes.captured_at is 'When the photo was taken, read from the file at upload. Groups photos shot together.';
