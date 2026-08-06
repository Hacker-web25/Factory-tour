export type Visibility = "private" | "unlisted" | "public";

/** Which animation the public viewer plays when switching between scenes.
 *  Set per-tour in the editor's Photo tab. */
export type TransitionEffect =
  | "street_view"
  | "fade"
  | "zoom"
  | "slide"
  | "instant";

export type Folder = {
  id: string;
  name: string;
  /** SHA-256 hash of the password, or null if the folder is open. */
  password_hash: string | null;
  created_at: string;
};

export type Tour = {
  id: string;
  title: string;
  description: string | null;
  /** Optional folder membership. null/undefined = "Unfiled". */
  folder_id?: string | null;
  cover_scene_id: string | null;
  /** Legacy — kept in sync with visibility for backward compat. Use visibility. */
  published: boolean;
  /** Access mode: private (nobody), unlisted (link-only, optional password), public. */
  visibility: Visibility;
  /** Optional password for unlisted access. */
  unlisted_password: string | null;
  /** When true, panorama is rendered with BackSide (mirror-image world).
   *  When false, sphere is x-flipped so text and signs read correctly. */
  mirrored: boolean;
  /** Optional storage path for a user-uploaded dashboard thumbnail. */
  thumbnail_path: string | null;

  /** Corner-docked scene-index menu. */
  menu_enabled: boolean;
  menu_position: MenuPosition;
  menu_size: number;      // px, size of the icon button
  menu_opacity: number;   // 0..1, resting opacity when the menu is closed

  /** Nadir patch — circular image at the south pole of every scene. */
  nadir_image_path: string | null;
  nadir_size: number;    // percent of viewport height (default 25)

  /** Auto-tour (walkthrough). */
  auto_tour_enabled: boolean;
  auto_tour_interval: number;   // default seconds per scene (used when a scene has no override)
  auto_tour_rotate: boolean;    // slow 360° camera rotation while playing
  auto_tour_rotate_speed: number; // 0.5..6 — higher = faster
  auto_tour_loop: boolean;      // restart from scene 1 after the last scene

  /** Tour-wide ambient audio. When set, this overrides per-scene ambient
   *  audio and plays continuously across scene switches without resetting. */
  ambient_audio_url: string | null;
  ambient_audio_volume: number;

  /** Which animation plays when the viewer navigates between scenes. */
  transition_effect: TransitionEffect;

  created_at: string;
  updated_at: string;
};

export type MenuPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type Scene = {
  id: string;
  tour_id: string;
  name: string;
  image_path: string;
  order_index: number;
  initial_yaw: number;
  initial_pitch: number;
  /** Optional ambient audio (loops while scene is active). */
  ambient_audio_url: string | null;
  ambient_audio_volume: number; // 0..1
  /** Per-scene duration override for auto-tour (seconds). null = use tour default. */
  auto_tour_duration: number | null;
  /** Camera control limits (radians). null = unlimited. */
  pitch_min: number | null;
  pitch_max: number | null;
  yaw_min: number | null;
  yaw_max: number | null;
  /** Horizon roll correction in radians (positive = clockwise). */
  level_correction: number;
  /** Zoom (FOV) controls. FOV in degrees. Smaller = zoomed in. */
  zoom_min_fov: number;      // how far in (30 = tight zoom-in)
  zoom_max_fov: number;      // how far out (90 = wide)
  zoom_initial_fov: number;  // the fov when the scene opens
  /** Wheel/pinch step multiplier — 1.0 default, 0.3 slow, 3 fast. */
  zoom_sensitivity: number;
  /** Per-scene thumbnail (custom or captured). Falls back to image_path. */
  thumbnail_path: string | null;
  /** Non-panoramic (flat) image — renders as a fixed plane instead of a sphere. */
  is_flat: boolean;
  /** When true, blend the equirectangular seam so the vertical stitching line
   *  vanishes into surrounding texture. */
  hide_stitching: boolean;
  /** Auto-hide the tripod / selfie-stick shadow at the south pole by painting
   *  a color-matched disc sampled from the surrounding floor. */
  hide_tripod: boolean;
  /** Diameter of the tripod cover disc, in % of viewport height (default 30). */
  tripod_size: number;

  /** Assumed camera height in metres — used by the measuring tool to project
   *  clicks onto the floor plane. Default 1.6 (typical tripod height). */
  camera_height: number;
  /** Optional grouping label for the scene index menu. Scenes with the same
   *  folder name are grouped together (with a collapsible header). */
  folder: string | null;

  created_at: string;
};

/** what the hotspot renders as */
export type HotspotType =
  | "icon"
  | "image"
  | "text"
  | "nav"
  | "info"
  | "url"
  | "video"
  | "pdf"
  | "polygon"
  | "audio";

/** what happens on click */
export type HotspotAction =
  | "none"
  | "nav"
  | "info_popup"
  | "url"
  | "image_popup"
  | "video_popup"
  | "pdf_popup"
  | "audio_popup";

export type SoundEffect =
  | "none"
  | "click"
  | "ding"
  | "pop"
  | "whoosh"
  | "success"
  | "custom";

/** Overlay rendering mode:
 *  - billboard: 2D card that always faces the camera (default for icons/text)
 *  - surface:   flat 2D plane that hugs the sphere at the hotspot (generic wall stick)
 *  - floor:     plane rotated flat, laid on the ground (for floor-mounted objects)
 *  - wall:      plane matched to a specific wall's perspective — tunable via
 *               wall_tilt_yaw / _pitch / _roll for precise integration
 */
export type OverlayMode = "billboard" | "surface" | "floor" | "wall";

export type HotspotAnimation =
  | "none"
  | "bounce"
  | "pulse"
  | "wave"
  | "spin"
  | "shake";

export type LabelFont =
  | "sans"
  | "serif"
  | "mono"
  | "cursive"
  | "display";

export type Hotspot = {
  id: string;
  scene_id: string;
  type: HotspotType;

  // spherical position (radians)
  yaw: number;
  pitch: number;

  // legacy display
  label: string | null;
  color: string;
  size: number;

  // icon
  icon_key: string | null;      // built-in library key
  icon_url: string | null;      // uploaded image
  icon_tint: string;            // hex, applied to built-in icons

  // appearance
  width_pct: number;            // 0-200 (percent of base)
  height_pct: number;
  link_wh: boolean;             // lock aspect
  opacity: number;              // 0-1
  rotation_deg: number;         // 2D rotation on the sprite

  // label styling
  label_color: string;
  label_size: number;           // px
  label_bold: boolean;

  // flags
  only_hover: boolean;
  shadow: boolean;

  // action
  action: HotspotAction;

  // appears in every scene of the tour at the same yaw/pitch
  is_master: boolean;

  // subtle animation on hover
  animation: HotspotAnimation;

  // label typography extras
  label_font: LabelFont;
  label_bg: string | null;

  // type-specific payload
  target_scene_id?: string | null;
  info_title?: string | null;
  info_body?: string | null;
  image_url?: string | null;
  overlay_mode?: OverlayMode;
  url?: string | null;

  // video / pdf hotspots
  video_url?: string | null;
  /** Voice-note / narration audio (mp3/wav/m4a). Clicking the hotspot
   *  opens a small floating audio player over the panorama. */
  audio_url?: string | null;
  video_source?: "youtube" | "upload" | null;
  pdf_url?: string | null;
  pdf_name?: string | null;

  // click sound
  sound_effect: SoundEffect;
  sound_effect_url: string | null; // when sound_effect === "custom"

  /** Auto-tour: showcase this hotspot automatically during scene playback. */
  auto_tour_showcase: boolean;
  auto_tour_showcase_at: number; // seconds from scene start when the action fires
  auto_tour_showcase_duration: number; // seconds to leave the popup open before auto-close

  /** For flat (non-panoramic) scenes — position as fractions 0..1 across the image. */
  flat_x: number;
  flat_y: number;

  /** When false, hotspot stays the same on-screen size regardless of camera
   *  zoom (like a UI overlay). When true (default), it lives in world-space
   *  and grows when the user zooms in. */
  scale_on_zoom: boolean;

  /** Fine perspective tuning for the WALL overlay mode (radians). */
  wall_tilt_yaw: number;
  wall_tilt_pitch: number;
  wall_tilt_roll: number;

  /** Polygon hotspot — outline of an arbitrary object drawn by the user. */
  polygon_points: { yaw: number; pitch: number }[] | null;
  polygon_fill_color: string;
  polygon_stroke_color: string;
  polygon_fill_opacity: number;
  polygon_stroke_width: number;

  /** In-place video card. */
  video_show_thumbnail: boolean;
  video_thumbnail_url: string | null;

  created_at: string;
};
