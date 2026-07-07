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

-- Storage: allow uploading custom icons under the same bucket (icons/*)
-- (existing policies already cover this since they match bucket_id only.)

