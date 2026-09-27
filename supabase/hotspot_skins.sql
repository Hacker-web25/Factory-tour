-- Premium hotspot skins: glowing rings, hexagon, crosshair, orbit, scanner,
-- shape frames (circle/square/diamond/hexagon/octagon), neon glow colour,
-- and the glowing connector line from icon to popup card.
--
-- Run once in Supabase → SQL editor.

alter table public.hotspots
  add column if not exists skin           text default 'none',
  add column if not exists glow_color     text,
  add column if not exists icon_shape     text default 'circle',
  add column if not exists card_connector boolean default true;

notify pgrst, 'reload schema';
