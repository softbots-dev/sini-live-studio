/*
  Pemilihan encoder video libobs: kartu grafis dulu (NVIDIA NVENC → AMD AMF → Intel QuickSync), selain itu
  x264. Tanpa encoder perangkat keras profil diturunkan ke 720p dan ≤ 4500 kbps — tidak pernah naik di
  atas profil dari server.
*/
const ORDER = [
  ["obs_nvenc_h264_tex", "jim_nvenc", "ffmpeg_nvenc"],
  ["h264_texture_amf", "amd_amf_h264"],
  ["obs_qsv11_v2", "obs_qsv11"],
];
export const SOFTWARE_ENCODER = "obs_x264";
const HARDWARE = new Set(ORDER.flat());

/** @param {string[]} available id encoder dari libobs  @param {string} [preferred] pilihan pengguna */
export function pickEncoder(available, preferred) {
  const have = new Set(available ?? []);
  if (preferred && (have.has(preferred) || preferred === SOFTWARE_ENCODER)) return { id: preferred, hardware: HARDWARE.has(preferred) };
  for (const family of ORDER) for (const id of family) if (have.has(id)) return { id, hardware: true };
  return { id: SOFTWARE_ENCODER, hardware: false };
}

export const SOFTWARE_MAX_KBPS = 4500;

export function fitProfile(profile, hardware) {
  if (hardware) return profile;
  const portrait = profile.height > profile.width;
  return {
    ...profile,
    width: portrait ? 720 : 1280,
    height: portrait ? 1280 : 720,
    videoKbps: Math.min(profile.videoKbps, SOFTWARE_MAX_KBPS),
    maxVideoKbps: Math.min(profile.maxVideoKbps ?? SOFTWARE_MAX_KBPS, SOFTWARE_MAX_KBPS),
  };
}

/** Pengaturan encoder libobs: CBR pada bitrate profil, keyframe dari profil (2 dtk). */
export function encoderSettings(id, profile) {
  const base = { rate_control: "CBR", bitrate: profile.videoKbps, keyint_sec: profile.keyframeSec ?? 2 };
  if (id === SOFTWARE_ENCODER) return { ...base, preset: "veryfast", profile: "high", tune: "" };
  if (ORDER[0].includes(id)) return { ...base, preset2: "p5", profile: "high", bf: 2 };
  if (ORDER[1].includes(id)) return { ...base, profile: "high" };
  return { ...base, target_usage: "balanced", profile: "high" };
}
