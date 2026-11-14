/*
  Pengelola scene Sini Live Studio: koleksi tersimpan (engine/collection.mjs) ↔ mesin OBS. Setiap
  perubahan diterapkan ke mesin lalu disimpan (`save(json)`) — tanpa alamat kirim (collection.serialize
  membuangnya). Item disimpan dari bawah ke atas (indeks 0 = lapisan paling bawah).
*/
import { MAX_ITEMS_PER_SCENE, parse, serialize } from "./engine/collection.mjs";

export const CANVAS = { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } };

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export function createSceneManager({ engine, load, save, newId }) {
  let state = parse(load() ?? "");

  const persist = () => save(serialize(state));
  const scene = (id) => state.scenes.find((s) => s.id === id) ?? null;
  const active = () => scene(state.activeSceneId) ?? state.scenes[0];
  const source = (id) => state.sources.find((s) => s.id === id) ?? null;
  const findItem = (itemId) => {
    for (const s of state.scenes) {
      const item = s.items.find((i) => i.id === itemId);
      if (item) return { scene: s, item };
    }
    throw fail("item_missing");
  };
  const transform = (i) => ({ x: i.x ?? 0, y: i.y ?? 0, scaleX: i.scaleX ?? 1, scaleY: i.scaleY ?? 1, crop: i.crop, visible: i.visible !== false });

  function applySourceAudio(s) {
    if (typeof s.volume === "number") engine.setVolume(s.id, s.volume);
    if (s.muted) engine.setMuted(s.id, true);
    if (s.monitoring && s.monitoring !== "none") engine.setMonitoring(s.id, s.monitoring);
    if (s.filters?.length) engine.setFilters(s.id, s.filters);
  }

  return {
    /** Terapkan seluruh koleksi ke mesin (saat masuk / ganti akun). */
    apply() {
      engine.setCanvas(CANVAS[state.orientation]);
      for (const s of state.sources) {
        try {
          engine.createSource(s.id, s.kind, s.settings ?? {});
          applySourceAudio(s);
        } catch {
          // Sumber yang tidak bisa dibuat (mis. perangkat dicabut) dibiarkan di daftar; item-nya dilewati.
        }
      }
      for (const sc of state.scenes) {
        engine.createScene(sc.id);
        for (const item of sc.items) {
          try {
            engine.addItem(sc.id, item.id, item.sourceId, transform(item));
          } catch {
            // item yang sumbernya hilang
          }
        }
        engine.orderItems(sc.id, sc.items.map((i) => i.id));
      }
      engine.setActiveScene(active().id);
    },

    snapshot() {
      return JSON.parse(serialize(state));
    },

    orientation: () => state.orientation,

    setOrientation(orientation) {
      state.orientation = orientation === "portrait" ? "portrait" : "landscape";
      engine.setCanvas(CANVAS[state.orientation]);
      persist();
    },

    addScene(name) {
      const id = newId("scene");
      state.scenes.push({ id, name: String(name ?? "").slice(0, 80), items: [] });
      engine.createScene(id);
      persist();
      return id;
    },

    renameScene(id, name) {
      const s = scene(id);
      if (!s) throw fail("scene_missing");
      s.name = String(name ?? "").slice(0, 80);
      persist();
    },

    removeScene(id) {
      if (state.scenes.length <= 1) throw fail("last_scene");
      const s = scene(id);
      if (!s) return;
      for (const item of [...s.items]) this.removeItem(item.id);
      state.scenes = state.scenes.filter((x) => x.id !== id);
      engine.removeScene(id);
      if (state.activeSceneId === id) this.setActiveScene(state.scenes[0].id);
      persist();
    },

    setActiveScene(id) {
      if (!scene(id)) throw fail("scene_missing");
      state.activeSceneId = id;
      engine.setActiveScene(id);
      persist();
    },

    /** Sumber baru + item di scene aktif. */
    addSource(kind, name, settings = {}, place = { x: 0, y: 0, scaleX: 1, scaleY: 1 }) {
      const sc = active();
      if (sc.items.length >= MAX_ITEMS_PER_SCENE) throw fail("scene_full");
      const sourceId = newId("source");
      const itemId = newId("item");
      engine.createSource(sourceId, kind, settings);
      const src = { id: sourceId, kind, name: String(name ?? "").slice(0, 80), settings, volume: 1, muted: false, monitoring: "none", filters: [] };
      state.sources.push(src);
      const item = { id: itemId, sourceId, ...place, visible: true, locked: false };
      engine.addItem(sc.id, itemId, sourceId, transform(item));
      sc.items.push(item);
      persist();
      return { sourceId, itemId };
    },

    updateSource(id, settings) {
      const s = source(id);
      if (!s) throw fail("source_missing");
      s.settings = { ...s.settings, ...settings };
      engine.updateSource(id, s.settings);
      persist();
    },

    renameSource(id, name) {
      const s = source(id);
      if (!s) throw fail("source_missing");
      s.name = String(name ?? "").slice(0, 80);
      persist();
    },

    removeItem(itemId) {
      const { scene: sc, item } = findItem(itemId);
      engine.removeItem(sc.id, itemId);
      sc.items = sc.items.filter((i) => i.id !== itemId);
      const stillUsed = state.scenes.some((s) => s.items.some((i) => i.sourceId === item.sourceId));
      if (!stillUsed) {
        engine.removeSource(item.sourceId);
        state.sources = state.sources.filter((s) => s.id !== item.sourceId);
      }
      persist();
    },

    setItem(itemId, patch) {
      const { scene: sc, item } = findItem(itemId);
      for (const k of ["x", "y", "scaleX", "scaleY"]) if (typeof patch[k] === "number" && Number.isFinite(patch[k])) item[k] = patch[k];
      if (patch.crop) item.crop = { left: 0, right: 0, top: 0, bottom: 0, ...patch.crop };
      if (typeof patch.visible === "boolean") item.visible = patch.visible;
      if (typeof patch.locked === "boolean") item.locked = patch.locked;
      engine.setItem(sc.id, itemId, transform(item));
      persist();
    },

    /** "up" = ke lapisan atas, "down" = ke bawah. */
    moveItem(itemId, dir) {
      const { scene: sc } = findItem(itemId);
      const i = sc.items.findIndex((x) => x.id === itemId);
      const j = dir === "up" ? i + 1 : i - 1;
      if (j < 0 || j >= sc.items.length) return;
      [sc.items[i], sc.items[j]] = [sc.items[j], sc.items[i]];
      engine.orderItems(sc.id, sc.items.map((x) => x.id));
      persist();
    },

    setVolume(id, mul) {
      const s = source(id);
      if (!s) return;
      s.volume = Math.max(0, Math.min(1, Number(mul) || 0));
      engine.setVolume(id, s.volume);
      persist();
    },

    setMuted(id, muted) {
      const s = source(id);
      if (!s) return;
      s.muted = Boolean(muted);
      engine.setMuted(id, s.muted);
      persist();
    },

    setMonitoring(id, mode) {
      const s = source(id);
      if (!s) return;
      s.monitoring = ["monitor", "monitorAndOutput"].includes(mode) ? mode : "none";
      engine.setMonitoring(id, s.monitoring);
      persist();
    },

    setFilters(id, filters) {
      const s = source(id);
      if (!s) return;
      s.filters = filters;
      engine.setFilters(id, filters);
      persist();
    },
  };
}
