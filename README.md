# Factory Tour

A Kuula-style 360° virtual tour platform, oriented toward factory & manufacturing sites.

Stack: Next.js 14 (App Router) · React · Three.js (via @react-three/fiber + drei) · Supabase (Postgres + Storage) · Tailwind.

## Run it

### 1. Install dependencies

```bash
cd "Kuula Copy"
npm install
```

### 2. Apply the database schema

- Open your Supabase project → **SQL Editor** → New query.
- Paste the contents of `supabase/schema.sql` and run it.
- Then go to **Storage** → confirm you have a bucket named `panoramas` with **Public** access ON (you created this in setup).

### 3. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000

## What's in this MVP

**Dashboard** (`/`)
- List tours, filter by all / published / draft, search
- Storage usage
- Recent uploads grid
- Create / delete tours

**Upload** (`/upload`)
- Drag & drop, batch upload of JPG/PNG
- Auto-detects panoramas via 2:1 aspect check
- Uploads to Supabase Storage and creates a Scene row per file

**Tour builder** (`/tour/[id]/edit`)
- Kuula-style layout: 360° canvas center, right panel with PHOTO / ADDON tabs, scene thumbnails bottom.
- **Add hotspots**: click an add-on button in the Photo tab, then click on the panorama to place it.
- Hotspot types: **Nav** (jump to scene), **Info** (title + body popup), **Image** (with both overlay modes), **URL**.
- **Overlay modes for image hotspots**:
  - `Billboard` — always faces the camera (default). Like a floating logo.
  - `Surface (2D)` — projected onto the panorama sphere. Skews & follows perspective like a sticker on a wall.
- Rename scenes, reorder by drag & drop, set initial heading (yaw/pitch), publish/draft toggle.

**Public viewer** (`/tour/[id]`)
- Renders the tour with clickable hotspots, scene strip at bottom, info modal for info/image hotspots.

**Embed** (`/embed/[id]?autoplay=1&hideControls=1`)
- Same viewer, embeddable via iframe.
- Share modal in the builder generates the iframe code with width / height / autoplay / hide controls options.

## Project layout

```
app/
  page.tsx                      # dashboard
  upload/page.tsx               # upload UI
  tour/[id]/edit/page.tsx       # tour builder
  tour/[id]/page.tsx            # public viewer
  embed/[id]/page.tsx           # iframe embed
components/
  TopBar.tsx
  panorama/
    PanoramaViewer.tsx          # Three.js sphere + hotspots
    math.ts                     # yaw/pitch <-> vec3
  builder/
    RightPanel.tsx              # PHOTO / ADDON tabs
    SceneStrip.tsx              # bottom thumbnails
    ShareModal.tsx              # public link + iframe generator
  viewer/
    TourPlayer.tsx              # runtime tour player (public + embed)
lib/
  supabase.ts                   # supabase client + publicUrl helper
  types.ts                      # Tour / Scene / Hotspot
supabase/
  schema.sql                    # tables, RLS, storage policies
```

## Not yet built (intentionally, MVP scope)

Cut from your original spec to ship this pass. Easy adds once the core works:

- Auth / per-user tours (RLS currently permissive)
- Master (global) layer of hotspots across scenes
- Scene folders / grouping
- Password-protected & unlisted sharing
- QR code + social sharing
- Custom branding (logo, favicon, brand colors)
- Video / audio / PDF / product / custom HTML hotspots
- Undo / redo
- Analytics beyond storage stats
- Scene fade transitions & direction indicators
- Rotation / opacity controls per hotspot

Say which of these to tackle next and we'll extend the build.
