export type Tour = {
  id: string;
  title: string;
  description: string | null;
  cover_scene_id: string | null;
  published: boolean;
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
  created_at: string;
};

/** what the hotspot renders as */
export type HotspotType = "icon" | "image" | "text" | "nav" | "info" | "url" | "video";

/** what happens on click */
export type HotspotAction =
  | "none"
  | "nav"
  | "info_popup"
  | "url"
  | "image_popup"
  | "video_popup"
  | "pdf_popup";

export type SoundEffect =
  | "none"
  | "click"
  | "ding"
  | "pop"
  | "whoosh"
  | "success"
  | "custom";

export type OverlayMode = "billboard" | "surface";

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

  created_at: string;
};
