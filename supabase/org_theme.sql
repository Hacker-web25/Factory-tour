-- Per-org dashboard theming.
--
-- Stores the theme selections (colours, fonts, gradient, blur) for the
-- org's own admin + sales dashboards. Rendered as CSS variables at the
-- top of the dashboard wrapper, so only signed-in members of that org
-- see the theme — the public tour viewer and other orgs' dashboards
-- stay untouched.
--
-- Schema (JSON, flexible so we can add fields without another migration):
--   {
--     "enabled": bool,
--     "canvas":  "#fafafa",           -- base surface / page bg
--     "ink":     "#0a0a0a",           -- primary text colour
--     "muted":   "#525252",           -- secondary text colour
--     "line":    "#e5e5e5",           -- borders
--     "tint":    "#f5f5f5",           -- hover / soft surface
--     "accent":  "#19b8f2",           -- action / brand highlight
--     "button_bg":   "#0f172a",
--     "button_text": "#ffffff",
--     "font":    "Inter",             -- Google Fonts family name
--     "font_url": "https://...",       -- resolved Google Fonts stylesheet URL
--     "translucent_bg": false,        -- panels get semi-transparent glass
--     "translucent_button": false,
--     "blur_px": 14,                  -- backdrop blur strength when translucent
--     "gradient": {                   -- optional overlay behind everything
--       "enabled": true,
--       "direction": "vertical",      -- "vertical" | "horizontal" | "diagonal"
--       "stops": [
--         { "color": "#19b8f2", "pos": 0 },
--         { "color": "#1e40af", "pos": 100 }
--       ]
--     }
--   }
--
-- Run once in Supabase → SQL editor. Safe to re-run.

alter table public.orgs
  add column if not exists theme jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
