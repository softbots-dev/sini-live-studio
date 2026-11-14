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
