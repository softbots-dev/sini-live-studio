// Pengelola scene (src/main/scene-manager.mjs): koleksi tersimpan → mesin OBS, setiap perubahan disimpan
// lagi (tanpa alamat kirim), batas 20 item per scene, scene terakhir tidak bisa dihapus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSceneManager } from "../src/main/scene-manager.mjs";

function fakeEngine() {
  const calls = [];
  const rec = (op) => (...args) => {
    calls.push([op, ...args]);
  };
  return {
    calls,
    createSource: rec("createSource"),
    updateSource: rec("updateSource"),
    removeSource: rec("removeSource"),
    createScene: rec("createScene"),
    removeScene: rec("removeScene"),
    setActiveScene: rec("setActiveScene"),
    addItem: rec("addItem"),
    setItem: rec("setItem"),
    removeItem: rec("removeItem"),
    orderItems: rec("orderItems"),
    setVolume: rec("setVolume"),
    setMuted: rec("setMuted"),
    setMonitoring: rec("setMonitoring"),
    setFilters: rec("setFilters"),
    setCanvas: rec("setCanvas"),
  };
}

function manager(saved = null) {
  const engine = fakeEngine();
  const writes = [];
  let n = 0;
  const m = createSceneManager({ engine, load: () => saved, save: (json) => writes.push(json), newId: (p) => `${p}-${++n}` });
  return { m, engine, writes };
}

test("koleksi kosong → satu scene aktif di mesin", () => {
  const { m, engine } = manager();
  m.apply();
  const s = m.snapshot();
  assert.equal(s.scenes.length, 1);
  assert.deepEqual(engine.calls.find((c) => c[0] === "setActiveScene"), ["setActiveScene", s.activeSceneId]);
  assert.ok(engine.calls.some((c) => c[0] === "setCanvas"));
});

test("koleksi tersimpan diterapkan: sumber, scene, item, volume, filter", () => {
  const saved = JSON.stringify({
    version: 1,
    orientation: "portrait",
    activeSceneId: "a",
    scenes: [{ id: "a", name: "Utama", items: [{ id: "i1", sourceId: "cam", x: 10, y: 20, scaleX: 0.5, scaleY: 0.5, visible: true, locked: false }] }],
    sources: [{ id: "cam", kind: "dshow_input", name: "Kamera", settings: { video_device_id: "x" }, volume: 0.8, muted: true, monitoring: "none", filters: [{ kind: "chroma_key_filter", settings: {} }] }],
  });
  const { m, engine } = manager(saved);
  m.apply();
  const ops = engine.calls.map((c) => c[0]);
  assert.deepEqual(engine.calls.find((c) => c[0] === "createSource"), ["createSource", "cam", "dshow_input", { video_device_id: "x" }]);
  assert.deepEqual(engine.calls.find((c) => c[0] === "addItem").slice(1, 4), ["a", "i1", "cam"]);
  assert.ok(ops.includes("setFilters") && ops.includes("setMuted") && ops.includes("setVolume"));
  assert.deepEqual(engine.calls.find((c) => c[0] === "setCanvas")[1], { width: 1080, height: 1920 });
});

test("tambah sumber → item di scene aktif, disimpan tanpa alamat kirim", () => {
  const { m, writes } = manager();
  m.apply();
  const { sourceId, itemId } = m.addSource("text_gdiplus", "Judul", { text: "Halo", server: "rtmps://h/app/" });
  const s = m.snapshot();
  assert.ok(s.scenes[0].items.some((i) => i.id === itemId && i.sourceId === sourceId));
  assert.match(writes.at(-1), /Halo/);
  assert.doesNotMatch(writes.at(-1), /rtmp|"server"/);
});

test("batas 20 item per scene; scene terakhir tidak bisa dihapus", () => {
  const { m } = manager();
  m.apply();
  for (let i = 0; i < 20; i++) m.addSource("text_gdiplus", `T${i}`, { text: String(i) });
  assert.throws(() => m.addSource("text_gdiplus", "lebih", {}), /scene_full/);
  assert.throws(() => m.removeScene(m.snapshot().activeSceneId), /last_scene/);
});

test("hapus item terakhir yang memakai sumber → sumber ikut dihapus", () => {
  const { m, engine } = manager();
  m.apply();
  const { sourceId, itemId } = m.addSource("monitor_capture", "Layar", {});
  m.removeItem(itemId);
  assert.ok(engine.calls.some((c) => c[0] === "removeSource" && c[1] === sourceId));
  assert.equal(m.snapshot().sources.length, 0);
});

test("scene baru, pindah, urutan lapisan, ubah item", () => {
  const { m, engine } = manager();
  m.apply();
  const a = m.addSource("text_gdiplus", "A", {}).itemId;
  const b = m.addSource("text_gdiplus", "B", {}).itemId;
  m.moveItem(a, "up");
  assert.deepEqual(m.snapshot().scenes[0].items.map((i) => i.id), [b, a]);
  assert.deepEqual(engine.calls.filter((c) => c[0] === "orderItems").at(-1)[2], [b, a]);
  m.setItem(a, { x: 5, y: 6, locked: true });
  const item = m.snapshot().scenes[0].items.find((i) => i.id === a);
  assert.deepEqual([item.x, item.y, item.locked], [5, 6, true]);
  const second = m.addScene("Jeda");
  m.setActiveScene(second);
  assert.equal(m.snapshot().activeSceneId, second);
  assert.deepEqual(engine.calls.at(-1), ["setActiveScene", second]);
});

test("teardown: semua sumber & scene dilepas dari mesin (ganti akun di PC yang sama)", () => {
  const { m, engine } = manager();
  m.apply();
  const { sourceId } = m.addSource("text_gdiplus", "A", {});
  const sceneId = m.snapshot().scenes[0].id;
  engine.calls.length = 0;
  m.teardown();
  assert.ok(engine.calls.some((c) => c[0] === "removeSource" && c[1] === sourceId));
  assert.ok(engine.calls.some((c) => c[0] === "removeScene" && c[1] === sceneId));
});

test("urutan lapisan: paling atas / paling bawah (menu klik kanan)", () => {
  const { m, engine } = manager();
  m.apply();
  const a = m.addSource("text_gdiplus", "A", {}).itemId;
  const b = m.addSource("text_gdiplus", "B", {}).itemId;
  const c = m.addSource("text_gdiplus", "C", {}).itemId;
  m.moveItem(a, "top");
  assert.deepEqual(m.snapshot().scenes[0].items.map((i) => i.id), [b, c, a]);
  m.moveItem(a, "bottom");
  assert.deepEqual(m.snapshot().scenes[0].items.map((i) => i.id), [a, b, c]);
  assert.deepEqual(engine.calls.filter((x) => x[0] === "orderItems").at(-1)[2], [a, b, c]);
  m.moveItem(a, "bottom"); // sudah paling bawah → tidak berubah
  assert.deepEqual(m.snapshot().scenes[0].items.map((i) => i.id), [a, b, c]);
});

test("putar & cermin: kelipatan 90 saja, tersimpan dan diteruskan ke mesin", () => {
  const { m, engine, writes } = manager();
  m.apply();
  const { itemId } = m.addSource("text_gdiplus", "A", {});
  m.setItem(itemId, { rotation: 45 });
  assert.equal(m.snapshot().scenes[0].items[0].rotation ?? 0, 0);
  m.setItem(itemId, { rotation: 270, flipV: true });
  const item = m.snapshot().scenes[0].items[0];
  assert.deepEqual([item.rotation, item.flipV, item.flipH ?? false], [270, true, false]);
  const last = engine.calls.filter((c) => c[0] === "setItem").at(-1)[3];
  assert.deepEqual([last.rotation, last.flipV], [270, true]);
  assert.match(writes.at(-1), /"rotation": 270/);
});

test("koleksi lama tanpa putar/cermin dimuat dengan nilai bawaan", () => {
  const saved = JSON.stringify({ version: 1, orientation: "landscape", activeSceneId: "a", scenes: [{ id: "a", name: "", items: [{ id: "i1", sourceId: "t", x: 1, y: 2, scaleX: 1, scaleY: 1, visible: true, locked: false }] }], sources: [{ id: "t", kind: "text_gdiplus", name: "T", settings: {} }] });
  const { m } = manager(saved);
  m.apply();
  const item = m.snapshot().scenes[0].items[0];
  assert.deepEqual([item.rotation, item.flipH, item.flipV, item.x, item.y], [0, false, false, 1, 2]);
});

test("validasi sumber: Tautan hanya https, Video wajib berkas", async () => {
  const { validateSourceSettings } = await import("../src/main/scene-manager.mjs");
  assert.deepEqual(validateSourceSettings("browser_source", { url: "http://a.b" }), { ok: false, code: "url_https_only" });
  assert.deepEqual(validateSourceSettings("browser_source", { url: "javascript:alert(1)" }), { ok: false, code: "url_https_only" });
  assert.deepEqual(validateSourceSettings("browser_source", { url: "https://sini.live" }), { ok: true });
  assert.deepEqual(validateSourceSettings("ffmpeg_source", { local_file: "" }), { ok: false, code: "file_missing" });
  assert.deepEqual(validateSourceSettings("ffmpeg_source", { local_file: "C:/v/a.mp4" }), { ok: true });
  assert.deepEqual(validateSourceSettings("text_gdiplus", {}), { ok: true });
});

test("putar ulang transform: hanya item berputar/bercermin", () => {
  const { m, engine } = manager();
  m.apply();
  const a = m.addSource("text_gdiplus", "A", {}).itemId;
  m.addSource("text_gdiplus", "B", {});
  m.setItem(a, { flipH: true });
  engine.calls.length = 0;
  m.reapplyOriented();
  const calls = engine.calls.filter((c) => c[0] === "setItem");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], a);
});
