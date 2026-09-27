-- Premium hotspot skins: glowing rings, hexagon, crosshair, orbit, scanner,
-- shape frames (circle/square/diamond/hexagon/octagon), neon glow colour +
-- intensity, shape fill colour, and the glowing connector line to the card.
--
-- Run once in Supabase → SQL editor. Safe to re-run (idempotent).

alter table public.hotspots
  add column if not exists skin             text default 'none',
  add column if not exists glow_color       text,
  add column if not exists glow_intensity   double precision default 100,
  add column if not exists icon_shape       text default 'circle',
  add column if not exists shape_fill_color text,
  add column if not exists card_connector   boolean default true;

notify pgrst, 'reload schema';
