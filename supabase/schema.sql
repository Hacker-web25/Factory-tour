-- Factory Tour schema. Run this in Supabase SQL editor.

create extension if not exists "pgcrypto";

-- TOURS
create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled tour',
  description text,
  cover_scene_id uuid,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SCENES
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  name text not null default 'Scene',
  image_path text not null,
  order_index int not null default 0,
  initial_yaw double precision not null default 0,
  initial_pitch double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists scenes_tour_idx on public.scenes(tour_id, order_index);

-- HOTSPOTS
create table if not exists public.hotspots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  type text not null check (type in ('nav','info','image','url','video')),
  yaw double precision not null default 0,
  pitch double precision not null default 0,
  label text,
  color text not null default '#22c55e',
  size double precision not null default 1,
  target_scene_id uuid references public.scenes(id) on delete set null,
  info_title text,
  info_body text,
  image_url text,
  overlay_mode text check (overlay_mode in ('billboard','surface')),
  url text,
  created_at timestamptz not null default now()
);
create index if not exists hotspots_scene_idx on public.hotspots(scene_id);

-- RLS: open for MVP (no auth). Tighten later.
alter table public.tours    enable row level security;
alter table public.scenes   enable row level security;
alter table public.hotspots enable row level security;

drop policy if exists "public read tours"    on public.tours;
drop policy if exists "public write tours"   on public.tours;
drop policy if exists "public read scenes"   on public.scenes;
drop policy if exists "public write scenes"  on public.scenes;
drop policy if exists "public read hotspots" on public.hotspots;
drop policy if exists "public write hotspots" on public.hotspots;

create policy "public read tours"    on public.tours    for select using (true);
create policy "public write tours"   on public.tours    for all    using (true) with check (true);
create policy "public read scenes"   on public.scenes   for select using (true);
create policy "public write scenes"  on public.scenes   for all    using (true) with check (true);
create policy "public read hotspots" on public.hotspots for select using (true);
create policy "public write hotspots" on public.hotspots for all    using (true) with check (true);

-- Storage bucket policy: allow public reads + anon uploads to 'panoramas'.
-- Create the bucket 'panoramas' in the Storage UI (Public = ON) before running these.
drop policy if exists "panoramas read"   on storage.objects;
drop policy if exists "panoramas insert" on storage.objects;
drop policy if exists "panoramas delete" on storage.objects;

create policy "panoramas read"
  on storage.objects for select
  using (bucket_id = 'panoramas');

create policy "panoramas insert"
  on storage.objects for insert
  with check (bucket_id = 'panoramas');

create policy "panoramas delete"
  on storage.objects for delete
  using (bucket_id = 'panoramas');

-- =====================================================================
-- MIGRATION 002 — extended hotspot settings (safe to re-run)
-- =====================================================================

alter table public.hotspots add column if not exists icon_key       text;
alter table public.hotspots add column if not exists icon_url       text;
alter table public.hotspots add column if not exists icon_tint      text    default '#ffffff';
alter table public.hotspots add column if not exists width_pct      double precision default 30;
alter table public.hotspots add column if not exists height_pct     double precision default 30;
alter table public.hotspots add column if not exists link_wh        boolean default true;
alter table public.hotspots add column if not exists opacity        double precision default 1;
alter table public.hotspots add column if not exists rotation_deg   double precision default 0;
alter table public.hotspots add column if not exists label_color    text    default '#ffffff';
alter table public.hotspots add column if not exists label_size     int     default 12;
alter table public.hotspots add column if not exists label_bold     boolean default false;
alter table public.hotspots add column if not exists only_hover     boolean default false;
alter table public.hotspots add column if not exists shadow         boolean default false;
alter table public.hotspots add column if not exists action         text    default 'none';

-- Relax type check to allow new render kinds
alter table public.hotspots drop constraint if exists hotspots_type_check;
alter table public.hotspots add constraint hotspots_type_check
  check (type in ('nav','info','image','url','video','icon','text'));

-- =====================================================================
-- MIGRATION 003 — master hotspots, animations, label typography
-- =====================================================================

alter table public.hotspots add column if not exists is_master  boolean default false;
alter table public.hotspots add column if not exists animation  text default 'none';
alter table public.hotspots add column if not exists label_font text default 'sans';
alter table public.hotspots add column if not exists label_bg   text;

create index if not exists hotspots_master_idx on public.hotspots(is_master) where is_master = true;

-- =====================================================================
-- MIGRATION 004 — tour mirror mode
-- =====================================================================

-- default = false = readable (sphere gets x-flipped in the viewer)
alter table public.tours add column if not exists mirrored boolean default false;

-- =====================================================================
-- MIGRATION 005 — dashboard thumbnail
-- =====================================================================

alter table public.tours add column if not exists thumbnail_path text;

-- =====================================================================
-- MIGRATION 006 — scene index menu
-- =====================================================================

alter table public.tours add column if not exists menu_enabled  boolean          default false;
alter table public.tours add column if not exists menu_position text             default 'top-left';
alter table public.tours add column if not exists menu_size     int              default 44;
alter table public.tours add column if not exists menu_opacity  double precision default 0.75;

-- =====================================================================
-- MIGRATION 007 — audio, nadir, auto-tour, video/pdf hotspots
-- =====================================================================

-- Ambient audio per scene
alter table public.scenes add column if not exists ambient_audio_url    text;
alter table public.scenes add column if not exists ambient_audio_volume double precision default 0.5;

-- Nadir patch + Auto-tour (tour-level)
alter table public.tours add column if not exists nadir_image_path   text;
alter table public.tours add column if not exists nadir_size         int default 25;
alter table public.tours add column if not exists auto_tour_enabled  boolean default false;
alter table public.tours add column if not exists auto_tour_interval int default 6;

-- Video / PDF hotspots + sound effect
alter table public.hotspots add column if not exists video_url        text;
alter table public.hotspots add column if not exists video_source     text default 'upload';
alter table public.hotspots add column if not exists pdf_url          text;
alter table public.hotspots add column if not exists pdf_name         text;
alter table public.hotspots add column if not exists sound_effect     text default 'none';
alter table public.hotspots add column if not exists sound_effect_url text;

-- Allow 'pdf' as a hotspot type
alter table public.hotspots drop constraint if exists hotspots_type_check;
alter table public.hotspots add constraint hotspots_type_check
  check (type in ('nav','info','image','url','video','icon','text','pdf'));

-- =====================================================================
-- MIGRATION 008 — tour-wide continuous ambient audio
-- =====================================================================

alter table public.tours add column if not exists ambient_audio_url    text;
alter table public.tours add column if not exists ambient_audio_volume double precision default 0.5;

-- =====================================================================
-- MIGRATION 009 — Auto-tour presentation controls
-- =====================================================================

-- Tour-level
alter table public.tours    add column if not exists auto_tour_rotate       boolean default true;
alter table public.tours    add column if not exists auto_tour_rotate_speed double precision default 1.5;
alter table public.tours    add column if not exists auto_tour_loop         boolean default true;

-- Scene-level per-scene duration override (null = use tour interval)
alter table public.scenes   add column if not exists auto_tour_duration     int;

-- Hotspot-level — fire this hotspot automatically at showcase_at seconds
alter table public.hotspots add column if not exists auto_tour_showcase           boolean default false;
alter table public.hotspots add column if not exists auto_tour_showcase_at        int     default 3;
alter table public.hotspots add column if not exists auto_tour_showcase_duration  int     default 5;

-- =====================================================================
-- MIGRATION 010 — one-time share links
-- =====================================================================

create table if not exists public.share_links (
  id         uuid primary key default gen_random_uuid(),
  tour_id    uuid not null references public.tours(id) on delete cascade,
  token      text unique not null,
  used       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists share_links_token_idx on public.share_links(token);
create index if not exists share_links_tour_idx  on public.share_links(tour_id);

alter table public.share_links enable row level security;

drop policy if exists "share_links read"  on public.share_links;
drop policy if exists "share_links write" on public.share_links;

create policy "share_links read"  on public.share_links for select using (true);
create policy "share_links write" on public.share_links for all    using (true) with check (true);

-- =====================================================================
-- MIGRATION 011 — visibility, unlisted password, session-scoped one-time links
-- =====================================================================

-- Tour access mode
alter table public.tours add column if not exists visibility        text default 'private';
alter table public.tours add column if not exists unlisted_password text;

-- Backfill from legacy published flag once
update public.tours set visibility = 'public'  where visibility is null and published = true;
update public.tours set visibility = 'private' where visibility is null and published = false;

alter table public.tours drop constraint if exists tours_visibility_check;
alter table public.tours add constraint tours_visibility_check
  check (visibility in ('private','unlisted','public'));

-- Session-scoped one-time links
alter table public.share_links add column if not exists session_minutes int; -- null = one-shot (expires on first close)
alter table public.share_links add column if not exists used_at         timestamptz;

-- =====================================================================
-- MIGRATION 012 — per-scene camera controls (heading, limits, level)
-- =====================================================================

alter table public.scenes add column if not exists pitch_min        double precision;
alter table public.scenes add column if not exists pitch_max        double precision;
alter table public.scenes add column if not exists yaw_min          double precision;
alter table public.scenes add column if not exists yaw_max          double precision;
alter table public.scenes add column if not exists level_correction double precision default 0;

-- Zoom controls
alter table public.scenes add column if not exists zoom_min_fov      int              default 30;
alter table public.scenes add column if not exists zoom_max_fov      int              default 90;
alter table public.scenes add column if not exists zoom_initial_fov  int              default 75;
alter table public.scenes add column if not exists zoom_sensitivity  double precision default 1.0;

-- =====================================================================
-- MIGRATION 013 — scene thumbnail, flat photo, hide stitching
-- =====================================================================

alter table public.scenes add column if not exists thumbnail_path text;
alter table public.scenes add column if not exists is_flat        boolean default false;
alter table public.scenes add column if not exists hide_stitching boolean default false;

-- Hotspot positions for flat (non-panoramic) scenes (0..1 range)
alter table public.hotspots add column if not exists flat_x double precision default 0.5;
alter table public.hotspots add column if not exists flat_y double precision default 0.5;

-- Storage: allow uploading custom icons under the same bucket (icons/*)
-- (existing policies already cover this since they match bucket_id only.)

-- =====================================================================
-- MIGRATION 014 — floor / wall overlays + scale-on-zoom + wall tilt
-- =====================================================================

-- overlay_mode is stored as text so 'floor' and 'wall' just work without
-- schema changes. New per-hotspot tuning fields:
alter table public.hotspots add column if not exists scale_on_zoom    boolean          default true;
alter table public.hotspots add column if not exists wall_tilt_yaw    double precision default 0;
alter table public.hotspots add column if not exists wall_tilt_pitch  double precision default 0;
alter table public.hotspots add column if not exists wall_tilt_roll   double precision default 0;

-- Reload PostgREST schema cache so REST sees the new columns immediately.
notify pgrst, 'reload schema';

-- =====================================================================
-- MIGRATION 015 — tripod / selfie-stick shadow removal
-- =====================================================================

alter table public.scenes add column if not exists hide_tripod boolean default false;
alter table public.scenes add column if not exists tripod_size int     default 30;

notify pgrst, 'reload schema';

-- =====================================================================
-- MIGRATION 016 — measurement, menu folders + thumbnails, polygon
-- hotspots, and in-place video cards
-- =====================================================================

-- Measurement: assumed camera height (metres) for floor-plane measurements
alter table public.scenes add column if not exists camera_height double precision default 1.6;

-- Menu organisation: optional folder grouping
alter table public.scenes add column if not exists folder text;

-- Polygon hotspots — array of {yaw, pitch} points on the sphere
alter table public.hotspots add column if not exists polygon_points        jsonb;
alter table public.hotspots add column if not exists polygon_fill_color    text  default '#22d3ee';
alter table public.hotspots add column if not exists polygon_stroke_color  text  default '#22d3ee';
alter table public.hotspots add column if not exists polygon_fill_opacity  double precision default 0.15;
alter table public.hotspots add column if not exists polygon_stroke_width  double precision default 2;

-- In-place video card (renders the video thumbnail + play button on the
-- panorama, playable in place instead of opening a modal)
alter table public.hotspots add column if not exists video_show_thumbnail  boolean default false;
alter table public.hotspots add column if not exists video_thumbnail_url   text;

-- Allow 'polygon' as a hotspot type
alter table public.hotspots drop constraint if exists hotspots_type_check;
alter table public.hotspots add constraint hotspots_type_check
  check (type in ('nav','info','image','url','video','icon','text','pdf','polygon'));

notify pgrst, 'reload schema';

-- =====================================================================
-- MIGRATION 017 — recently-used uploaded images
-- =====================================================================
-- Cross-tour, cross-scene registry of images the user has uploaded via the
-- IconPicker. Powers the "Recent" tab so a user can reuse a logo / signage /
-- machine photo without re-uploading it. Use count + last_used_at drive the
-- eviction policy (see lib/recentUploads.ts). Deleting rows here NEVER
-- deletes the underlying storage file — hotspots may still reference it.

create table if not exists public.recent_uploads (
  id             uuid primary key default gen_random_uuid(),
  storage_path   text unique not null,
  public_url     text not null,
  filename       text,
  mime           text,
  file_size      bigint,
  width          int,
  height         int,
  first_used_at  timestamptz not null default now(),
  last_used_at   timestamptz not null default now(),
  use_count      int not null default 1
);
create index if not exists recent_uploads_recency_idx  on public.recent_uploads(last_used_at desc);
create index if not exists recent_uploads_usecount_idx on public.recent_uploads(use_count);

alter table public.recent_uploads enable row level security;

drop policy if exists "recent_uploads read"  on public.recent_uploads;
drop policy if exists "recent_uploads write" on public.recent_uploads;

create policy "recent_uploads read"  on public.recent_uploads for select using (true);
create policy "recent_uploads write" on public.recent_uploads for all    using (true) with check (true);

notify pgrst, 'reload schema';

-- =====================================================================
-- MIGRATION 018 — per-tour transition effect
-- =====================================================================
-- Picks which animation the public viewer uses when switching scenes.
-- Values: 'street_view' (default), 'fade', 'zoom', 'slide', 'instant'.
-- Owner sets this in the editor's Photo tab; TourPlayer applies the
-- matching CSS class to the transition overlay.

alter table public.tours
  add column if not exists transition_effect text not null default 'street_view';

alter table public.tours drop constraint if exists tours_transition_effect_check;
alter table public.tours add constraint tours_transition_effect_check
  check (transition_effect in ('street_view','fade','zoom','slide','instant'));

notify pgrst, 'reload schema';

