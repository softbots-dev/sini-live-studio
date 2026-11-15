import { AppWindow, Cable, Camera, Clapperboard, Gamepad2, Globe, Image, Mic, Monitor, Type, Volume2, type LucideIcon } from "lucide-react";

/*
  Jenis sumber yang ditawarkan di dialog tambah sumber (urutan = urutan tampil) → jenis libobs, ikon, kelompok.
  Capture card memakai jenis libobs yang sama dengan kamera (`dshow_input`); bedanya label & penjelasan.
*/
export type UiKind = "game" | "camera" | "screen" | "window" | "captureCard" | "video" | "image" | "text" | "link" | "mic" | "desktopAudio";

export const KIND_META: Record<UiKind, { kind: string; icon: LucideIcon; group: "video" | "audio" }> = {
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
};
export const UI_KINDS = Object.keys(KIND_META) as UiKind[];

/** Ikon daftar sumber dari jenis libobs. */
export function iconForKind(kind: string): LucideIcon {
  return UI_KINDS.map((k) => KIND_META[k]).find((m) => m.kind === kind)?.icon ?? Monitor;
}

export const AUDIO_KINDS = new Set(["wasapi_input_capture", "wasapi_output_capture"]);

/** Pengaturan awal per jenis sumber (pengguna memilih perangkat/jendela/berkas di dialog setelahnya). */
export const SOURCE_DEFAULTS: Record<string, Record<string, unknown>> = {
  wasapi_input_capture: { device_id: "default" },
  wasapi_output_capture: { device_id: "default" },
  game_capture: { capture_mode: "any_fullscreen" },
  text_gdiplus: { text: "Sini", font: { face: "Arial", size: 96, style: "Regular", flags: 0 }, color: 0xffffffff },
};
