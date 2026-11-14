/*
  libobs menulis lognya sendiri ke folder data aplikasi (tidak bisa dialihkan dari JS). Log disaring
  saat siaran berhenti, saat aplikasi dibuka, dan saat keluar: setiap URL rtmp(s) dan setiap key yang
  diberikan diganti `[redacted]` (docs/live-studio.md §Kerahasiaan).
*/
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL = /rtmps?:\/\/\S+/gi;

export function scrubLog(text, keys = []) {
  let out = String(text).replace(URL, "rtmp://[redacted]");
  for (const k of keys) if (typeof k === "string" && k.length >= 4) out = out.split(k).join("[redacted]");
  return out;
}

export function scrubLogDir(dir, keys = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      scrubLogDir(p, keys);
      continue;
    }
    if (!/\.(txt|log)$/i.test(name) || st.size > 50 * 1024 * 1024) continue;
    try {
      const text = readFileSync(p, "utf8");
      const clean = scrubLog(text, keys);
      if (clean !== text) writeFileSync(p, clean);
    } catch {
      // Berkas sedang dikunci libobs — disaring pada kesempatan berikutnya.
    }
  }
}
