-- ============================================================================
-- FACTORY TOUR — COMPLETE SCHEMA (fresh install, safe to re-run)
-- Run this in Supabase SQL editor after creating the 'panoramas' storage bucket.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------- TABLES ----------

create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled tour',
  description text,
  cover_scene_id uuid,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.hotspots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  type text not null default 'icon',
  yaw double precision not null default 0,
  pitch double precision not null default 0,
  label text,
  color text not null default '#22c55e',
  size double precision not null default 1,
  target_scene_id uuid references public.scenes(id) on delete set null,
  info_title text,
  info_body text,
  image_url text,
  overlay_mode text,
  url text,
  created_at timestamptz not null default now()
);
create index if not exists hotspots_scene_idx on public.hotspots(scene_id);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'New folder',
  password_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.share_links (
  id         uuid primary key default gen_random_uuid(),
  tour_id    uuid not null references public.tours(id) on delete cascade,
  token      text unique not null,
  used       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists share_links_token_idx on public.share_links(token);
create index if not exists share_links_tour_idx  on public.share_links(tour_id);

create table if not exists public.tour_events (
  id         uuid primary key default gen_random_uuid(),
  tour_id    uuid not null references public.tours(id) on delete cascade,
  session_id text,
  event_type text not null,
  scene_id   uuid,
  hotspot_id uuid,
  metadata   jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tour_events_tour_idx    on public.tour_events(tour_id, created_at desc);
create index if not exists tour_events_session_idx on public.tour_events(session_id);

create table if not exists public.recent_uploads (
  id         uuid primary key default gen_random_uuid(),
  path       text not null,
  kind       text not null default 'icon',
  created_at timestamptz not null default now()
);
create index if not exists recent_uploads_created_idx on public.recent_uploads(created_at desc);

-- ---------- TOUR COLUMNS ----------

alter table public.tours add column if not exists mirrored              boolean          default false;
alter table public.tours add column if not exists thumbnail_path        text;
alter table public.tours add column if not exists menu_enabled          boolean          default false;
alter table public.tours add column if not exists menu_position         text             default 'top-left';
alter table public.tours add column if not exists menu_size             int              default 44;
alter table public.tours add column if not exists menu_opacity          double precision default 0.75;
alter table public.tours add column if not exists nadir_image_path      text;
alter table public.tours add column if not exists nadir_size            int              default 25;
alter table public.tours add column if not exists auto_tour_enabled     boolean          default false;
alter table public.tours add column if not exists auto_tour_interval    int              default 6;
alter table public.tours add column if not exists auto_tour_rotate      boolean          default true;
alter table public.tours add column if not exists auto_tour_rotate_speed double precision default 1.5;
alter table public.tours add column if not exists auto_tour_loop        boolean          default true;
alter table public.tours add column if not exists ambient_audio_url     text;
alter table public.tours add column if not exists ambient_audio_volume  double precision default 0.5;
alter table public.tours add column if not exists visibility            text             default 'private';
alter table public.tours add column if not exists unlisted_password     text;
alter table public.tours add column if not exists transition_effect     text             default 'street_view';
alter table public.tours add column if not exists folder_id             uuid references public.folders(id) on delete set null;
create index if not exists tours_folder_idx on public.tours(folder_id);

-- ---------- SCENE COLUMNS ----------

alter table public.scenes add column if not exists ambient_audio_url    text;
alter table public.scenes add column if not exists ambient_audio_volume double precision default 0.5;
alter table public.scenes add column if not exists auto_tour_duration   int;
alter table public.scenes add column if not exists pitch_min            double precision;
alter table public.scenes add column if not exists pitch_max            double precision;
alter table public.scenes add column if not exists yaw_min              double precision;
alter table public.scenes add column if not exists yaw_max              double precision;
alter table public.scenes add column if not exists level_correction     double precision default 0;
alter table public.scenes add column if not exists zoom_min_fov         double precision default 30;
alter table public.scenes add column if not exists zoom_max_fov         double precision default 90;
alter table public.scenes add column if not exists zoom_initial_fov     double precision default 75;
alter table public.scenes add column if not exists zoom_sensitivity     double precision default 1;
alter table public.scenes add column if not exists thumbnail_path       text;
alter table public.scenes add column if not exists is_flat              boolean          default false;
alter table public.scenes add column if not exists hide_stitching       boolean          default false;
alter table public.scenes add column if not exists hide_tripod          boolean          default false;
alter table public.scenes add column if not exists tripod_size          double precision default 30;
alter table public.scenes add column if not exists camera_height        double precision default 1.6;
alter table public.scenes add column if not exists folder               text;

-- ---------- HOTSPOT COLUMNS ----------

alter table public.hotspots add column if not exists icon_key                    text;
alter table public.hotspots add column if not exists icon_url                    text;
alter table public.hotspots add column if not exists icon_tint                   text             default '#ffffff';
alter table public.hotspots add column if not exists width_pct                   double precision default 30;
alter table public.hotspots add column if not exists height_pct                  double precision default 30;
alter table public.hotspots add column if not exists link_wh                     boolean          default true;
alter table public.hotspots add column if not exists opacity                     double precision default 1;
alter table public.hotspots add column if not exists rotation_deg                double precision default 0;
alter table public.hotspots add column if not exists label_color                 text             default '#ffffff';
alter table public.hotspots add column if not exists label_size                  int              default 12;
alter table public.hotspots add column if not exists label_bold                  boolean          default false;
alter table public.hotspots add column if not exists only_hover                  boolean          default false;
alter table public.hotspots add column if not exists shadow                      boolean          default false;
alter table public.hotspots add column if not exists action                      text             default 'none';
alter table public.hotspots add column if not exists is_master                   boolean          default false;
alter table public.hotspots add column if not exists animation                   text             default 'none';
alter table public.hotspots add column if not exists label_font                  text             default 'sans';
alter table public.hotspots add column if not exists label_bg                    text;
alter table public.hotspots add column if not exists video_url                   text;
alter table public.hotspots add column if not exists audio_url                   text;
alter table public.hotspots add column if not exists video_source                text             default 'upload';
alter table public.hotspots add column if not exists pdf_url                     text;
alter table public.hotspots add column if not exists pdf_name                    text;
alter table public.hotspots add column if not exists sound_effect                text             default 'none';
alter table public.hotspots add column if not exists sound_effect_url            text;
alter table public.hotspots add column if not exists auto_tour_showcase          boolean          default false;
alter table public.hotspots add column if not exists auto_tour_showcase_at       int              default 3;
alter table public.hotspots add column if not exists auto_tour_showcase_duration int              default 5;
alter table public.hotspots add column if not exists flat_x                      double precision default 0.5;
alter table public.hotspots add column if not exists flat_y                      double precision default 0.5;
alter table public.hotspots add column if not exists scale_on_zoom               boolean          default true;
alter table public.hotspots add column if not exists wall_tilt_yaw               double precision default 0;
alter table public.hotspots add column if not exists wall_tilt_pitch             double precision default 0;
alter table public.hotspots add column if not exists wall_tilt_roll              double precision default 0;
alter table public.hotspots add column if not exists polygon_points              jsonb;
alter table public.hotspots add column if not exists polygon_fill_color          text             default '#22c55e';
alter table public.hotspots add column if not exists polygon_stroke_color        text             default '#22c55e';
alter table public.hotspots add column if not exists polygon_fill_opacity        double precision default 0.25;
alter table public.hotspots add column if not exists polygon_stroke_width        double precision default 2;
alter table public.hotspots add column if not exists video_show_thumbnail        boolean          default false;
alter table public.hotspots add column if not exists video_thumbnail_url         text;
alter table public.hotspots add column if not exists card_size_pct               int              default 80;
alter table public.hotspots add column if not exists thumbnail_size_pct          int              default 100;
alter table public.hotspots add column if not exists master_scene_ids            uuid[];

create index if not exists hotspots_master_idx on public.hotspots(is_master) where is_master = true;

alter table public.hotspots drop constraint if exists hotspots_type_check;
alter table public.hotspots add constraint hotspots_type_check
  check (type in ('nav','info','image','url','video','icon','text','pdf','polygon','audio','person'));

alter table public.hotspots drop constraint if exists hotspots_action_check;
alter table public.hotspots add constraint hotspots_action_check
  check (action in ('none','nav','info_popup','url','image_popup','video_popup','pdf_popup','audio_popup'));

-- ---------- ROW-LEVEL SECURITY (open for MVP) ----------

alter table public.tours          enable row level security;
alter table public.scenes         enable row level security;
alter table public.hotspots       enable row level security;
alter table public.folders        enable row level security;
alter table public.share_links    enable row level security;
alter table public.tour_events    enable row level security;
alter table public.recent_uploads enable row level security;

drop policy if exists "tours read"          on public.tours;
drop policy if exists "tours write"         on public.tours;
drop policy if exists "scenes read"         on public.scenes;
drop policy if exists "scenes write"        on public.scenes;
drop policy if exists "hotspots read"       on public.hotspots;
drop policy if exists "hotspots write"      on public.hotspots;
drop policy if exists "folders read"        on public.folders;
drop policy if exists "folders write"       on public.folders;
drop policy if exists "share_links read"    on public.share_links;
drop policy if exists "share_links write"   on public.share_links;
drop policy if exists "tour_events read"    on public.tour_events;
drop policy if exists "tour_events write"   on public.tour_events;
drop policy if exists "recent_uploads read" on public.recent_uploads;
drop policy if exists "recent_uploads write" on public.recent_uploads;

create policy "tours read"           on public.tours          for select using (true);
create policy "tours write"          on public.tours          for all    using (true) with check (true);
create policy "scenes read"          on public.scenes         for select using (true);
create policy "scenes write"         on public.scenes         for all    using (true) with check (true);
create policy "hotspots read"        on public.hotspots       for select using (true);
create policy "hotspots write"       on public.hotspots       for all    using (true) with check (true);
create policy "folders read"         on public.folders        for select using (true);
create policy "folders write"        on public.folders        for all    using (true) with check (true);
create policy "share_links read"     on public.share_links    for select using (true);
create policy "share_links write"    on public.share_links    for all    using (true) with check (true);
create policy "tour_events read"     on public.tour_events    for select using (true);
create policy "tour_events write"    on public.tour_events    for all    using (true) with check (true);
create policy "recent_uploads read"  on public.recent_uploads for select using (true);
create policy "recent_uploads write" on public.recent_uploads for all    using (true) with check (true);

-- ---------- STORAGE BUCKET POLICIES ('panoramas' — must exist, PUBLIC) ----------

drop policy if exists "panoramas read"   on storage.objects;
drop policy if exists "panoramas insert" on storage.objects;
drop policy if exists "panoramas update" on storage.objects;
drop policy if exists "panoramas delete" on storage.objects;

create policy "panoramas read"   on storage.objects for select using (bucket_id = 'panoramas');
create policy "panoramas insert" on storage.objects for insert with check (bucket_id = 'panoramas');
create policy "panoramas update" on storage.objects for update using (bucket_id = 'panoramas') with check (bucket_id = 'panoramas');
create policy "panoramas delete" on storage.objects for delete using (bucket_id = 'panoramas');

-- Force PostgREST to reload the schema cache so new columns are visible immediately
notify pgrst, 'reload schema';
