// Lib murni mesin OBS: pemilih encoder (src/main/engine/encoder.mjs), koleksi scene yang disimpan per akun
// (collection.mjs — tidak pernah membawa alamat kirim), dan penyaring log libobs (log-scrub.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fitProfile, pickEncoder } from "../src/main/engine/encoder.mjs";
import { emptyCollection, MAX_ITEMS_PER_SCENE, parse, serialize } from "../src/main/engine/collection.mjs";
import { scrubLog, scrubLogDir } from "../src/main/engine/log-scrub.mjs";

const landscape = { width: 1920, height: 1080, fps: 30, videoKbps: 6000, minVideoKbps: 2500, maxVideoKbps: 8000, keyframeSec: 2, audioKbps: 160, sampleRate: 48000, stereo: true };
const portrait = { ...landscape, width: 1080, height: 1920 };

test("pickEncoder: NVENC → AMF → QSV → x264", () => {
  assert.deepEqual(pickEncoder(["obs_x264", "jim_nvenc"]), { id: "jim_nvenc", hardware: true });
  assert.deepEqual(pickEncoder(["obs_x264", "obs_nvenc_h264_tex"]), { id: "obs_nvenc_h264_tex", hardware: true });
  assert.deepEqual(pickEncoder(["obs_x264", "amd_amf_h264"]), { id: "amd_amf_h264", hardware: true });
  assert.deepEqual(pickEncoder(["obs_qsv11_v2", "obs_x264", "h264_texture_amf"]), { id: "h264_texture_amf", hardware: true });
  assert.deepEqual(pickEncoder(["obs_x264", "obs_qsv11"]), { id: "obs_qsv11", hardware: true });
  assert.deepEqual(pickEncoder(["obs_x264"]), { id: "obs_x264", hardware: false });
  assert.deepEqual(pickEncoder([], "obs_x264"), { id: "obs_x264", hardware: false });
  // Pilihan pengguna dipakai kalau tersedia.
  assert.deepEqual(pickEncoder(["obs_x264", "jim_nvenc"], "obs_x264"), { id: "obs_x264", hardware: false });
});

test("fitProfile: perangkat keras apa adanya; x264 turun ke 720p dan ≤ 4500 kbps", () => {
  assert.deepEqual(fitProfile(landscape, true), landscape);
  const sw = fitProfile(landscape, false);
  assert.deepEqual([sw.width, sw.height, sw.videoKbps, sw.maxVideoKbps], [1280, 720, 4500, 4500]);
  const swp = fitProfile(portrait, false);
  assert.deepEqual([swp.width, swp.height], [720, 1280]);
  assert.equal(fitProfile({ ...landscape, videoKbps: 3000 }, false).videoKbps, 3000);
});

test("koleksi tidak pernah membawa alamat kirim", () => {
  const s = parse(JSON.stringify({
    version: 1,
    activeSceneId: "s1",
    orientation: "landscape",
    scenes: [{ id: "s1", name: "Utama", items: [] }],
    sources: [{ id: "a", kind: "text_gdiplus", name: "Teks", settings: { text: "hai", url: "rtmps://h/app/k" }, filters: [] }],
    service: { server: "rtmps://h/app/", key: "k" },
    streamKey: "k",
  }));
  const out = serialize(s);
  assert.doesNotMatch(out, /rtmp|"key"|streamKey|"service"/);
  assert.equal(s.scenes[0].name, "Utama");
  assert.equal(s.sources[0].settings.text, "hai");
});

test("koleksi rusak → koleksi kosong; batas item per scene", () => {
  assert.deepEqual(parse("bukan json"), emptyCollection());
  assert.deepEqual(parse(JSON.stringify({ scenes: "x" })), emptyCollection());
  assert.equal(emptyCollection().scenes.length, 1);
  assert.equal(MAX_ITEMS_PER_SCENE, 20);
});

test("scrubLog menghapus URL rtmp(s) dan key", () => {
  const out = scrubLog("Connecting to RTMP URL rtmps://abc.example:443/app/...\nkey sk_xyz used\nRTMP://X/y", ["sk_xyz"]);
  assert.doesNotMatch(out, /abc\.example|sk_xyz|RTMP:\/\/X/);
  assert.match(out, /\[redacted\]/);
});

test("scrubLogDir menyaring semua berkas log di folder (rekursif)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sini-studio-log-"));
  mkdirSync(join(dir, "logs"));
  writeFileSync(join(dir, "logs", "2026-11-15.txt"), "rtmps://ingest.uji.invalid:443/app/ sk_uji_rahasia");
  writeFileSync(join(dir, "other.log"), "aman");
  scrubLogDir(dir, ["sk_uji_rahasia"]);
  const text = readFileSync(join(dir, "logs", "2026-11-15.txt"), "utf8");
  assert.doesNotMatch(text, /ingest\.uji\.invalid|sk_uji_rahasia/);
  assert.equal(readFileSync(join(dir, "other.log"), "utf8"), "aman");
});

test("encoderSettings: CBR, bitrate profil, keyframe 2 dtk per jenis encoder", async () => {
  const { encoderSettings } = await import("../src/main/engine/encoder.mjs");
  assert.deepEqual(encoderSettings("obs_x264", landscape), { rate_control: "CBR", bitrate: 6000, keyint_sec: 2, preset: "veryfast", profile: "high", tune: "" });
  assert.deepEqual(encoderSettings("jim_nvenc", landscape), { rate_control: "CBR", bitrate: 6000, keyint_sec: 2, preset2: "p5", profile: "high", bf: 2 });
  assert.deepEqual(encoderSettings("obs_nvenc_h264_tex", landscape).preset2, "p5");
  assert.deepEqual(encoderSettings("h264_texture_amf", landscape), { rate_control: "CBR", bitrate: 6000, keyint_sec: 2, profile: "high" });
  assert.deepEqual(encoderSettings("obs_qsv11_v2", landscape), { rate_control: "CBR", bitrate: 6000, keyint_sec: 2, target_usage: "balanced", profile: "high" });
});
