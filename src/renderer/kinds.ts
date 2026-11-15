import { AppWindow, BellRing, Cable, Camera, Clapperboard, Gamepad2, Globe, Hash, Image, MessagesSquare, Mic, Monitor, Target, Timer, Trophy, Type, Volume2, type LucideIcon } from "lucide-react";

/*
  Jenis sumber yang ditawarkan di dialog tambah sumber (urutan = urutan tampil) → jenis libobs, ikon, kelompok.
  Capture card memakai jenis libobs yang sama dengan kamera (`dshow_input`); bedanya label & penjelasan.
*/
export type WidgetType = "alert" | "goal" | "counter" | "countdown" | "ranking" | "chatbox";
export type UiKind = "game" | "camera" | "screen" | "window" | "captureCard" | "video" | "image" | "text" | "link" | "mic" | "desktopAudio" | `w_${WidgetType}`;
export const WIDGET_KIND = "sini_widget";

export const KIND_META: Record<UiKind, { kind: string; icon: LucideIcon; group: "video" | "audio" | "widget"; widget?: WidgetType }> = {
  game: { kind: "game_capture", icon: Gamepad2, group: "video" },
  camera: { kind: "dshow_input", icon: Camera, group: "video" },
  screen: { kind: "monitor_capture", icon: Monitor, group: "video" },
  window: { kind: "window_capture", icon: AppWindow, group: "video" },
  captureCard: { kind: "dshow_input", icon: Cable, group: "video" },
  video: { kind: "ffmpeg_source", icon: Clapperboard, group: "video" },
  image: { kind: "image_source", icon: Image, group: "video" },
  text: { kind: "text_gdiplus", icon: Type, group: "video" },
  link: { kind: "browser_source", icon: Globe, group: "video" },
  mic: { kind: "wasapi_input_capture", icon: Mic, group: "audio" },
  desktopAudio: { kind: "wasapi_output_capture", icon: Volume2, group: "audio" },
  w_alert: { kind: WIDGET_KIND, icon: BellRing, group: "widget", widget: "alert" },
  w_goal: { kind: WIDGET_KIND, icon: Target, group: "widget", widget: "goal" },
  w_counter: { kind: WIDGET_KIND, icon: Hash, group: "widget", widget: "counter" },
  w_countdown: { kind: WIDGET_KIND, icon: Timer, group: "widget", widget: "countdown" },
  w_ranking: { kind: WIDGET_KIND, icon: Trophy, group: "widget", widget: "ranking" },
  w_chatbox: { kind: WIDGET_KIND, icon: MessagesSquare, group: "widget", widget: "chatbox" },
};
export const UI_KINDS = Object.keys(KIND_META) as UiKind[];

/** Ikon daftar sumber dari jenis libobs. */
export function iconForKind(kind: string): LucideIcon {
  return UI_KINDS.map((k) => KIND_META[k]).find((m) => m.kind === kind)?.icon ?? Monitor;
}

/** Ikon satu sumber — widget memakai ikon jenis widgetnya. */
export function iconForSource(source: { kind: string; settings: Record<string, unknown> }): LucideIcon {
  if (source.kind === WIDGET_KIND) return UI_KINDS.map((k) => KIND_META[k]).find((m) => m.widget === source.settings.widget)?.icon ?? Hash;
  return iconForKind(source.kind);
}

export const AUDIO_KINDS = new Set(["wasapi_input_capture", "wasapi_output_capture"]);

/** Pengaturan awal per jenis sumber (pengguna memilih perangkat/jendela/berkas di dialog setelahnya). */
export const SOURCE_DEFAULTS: Record<string, Record<string, unknown>> = {
  wasapi_input_capture: { device_id: "default" },
  wasapi_output_capture: { device_id: "default" },
  game_capture: { capture_mode: "any_fullscreen" },
  text_gdiplus: { text: "Sini", font: { face: "Arial", size: 96, style: "Regular", flags: 0 }, color: 0xffffffff },
};
