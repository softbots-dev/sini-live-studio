/*
  Pengelola scene Sini Live Studio: koleksi tersimpan (engine/collection.mjs) ↔ mesin OBS. Setiap
  perubahan diterapkan ke mesin lalu disimpan (`save(json)`) — tanpa alamat kirim (collection.serialize
  membuangnya). Item disimpan dari bawah ke atas (indeks 0 = lapisan paling bawah).
*/
import { MAX_ITEMS_PER_SCENE, parse, serialize } from "./engine/collection.mjs";
import { isOriented } from "./engine/item-transform.mjs";
import { normalizeWidget, WIDGET_KIND } from "./widgets/config.mjs";

export const CANVAS = { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } };

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

/** Pengaturan sumber yang ditolak sebelum masuk mesin: Tautan hanya https, Video wajib berkas. */
export function validateSourceSettings(kind, settings = {}) {
  if (kind === "browser_source") {
    let ok = false;
    try {
      ok = new URL(String(settings.url ?? "")).protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) return { ok: false, code: "url_https_only" };
  }
  if (kind === "ffmpeg_source" && !(typeof settings.local_file === "string" && settings.local_file.trim())) return { ok: false, code: "file_missing" };
  return { ok: true };
}

/*
  Daftar-izin pengaturan dari renderer untuk jenis yang bisa membaca berkas lokal lewat pengaturan tersembunyi
  (sumber browser `is_local_file`/`local_file`/`css`/`webpage_control_level`, teks `read_from_file`/`file`).
  Renderer tepercaya, tapi proses utama tetap tidak meneruskan apa yang tidak pernah dikirim UI.
*/
const SETTINGS_ALLOW = {
  browser_source: ["url", "width", "height", "reroute_audio"],
  text_gdiplus: ["text", "font", "color"],
  ffmpeg_source: ["local_file", "is_local_file", "looping", "restart_on_activate"],
};
export function sanitizeSourceSettings(kind, settings = {}) {
  const allow = SETTINGS_ALLOW[kind];
  if (!allow) return settings;
  const out = Object.fromEntries(Object.entries(settings ?? {}).filter(([k]) => allow.includes(k)));
  // Video hanya dari berkas lokal — tidak pernah alamat jaringan lewat `input`.
  if (kind === "ffmpeg_source") out.is_local_file = true;
  return out;
}

/**
 * `widgetSource(sourceId, settings)` → { kind: "browser_source", settings } — sumber `sini_widget` disimpan
 * apa adanya di koleksi, tapi mesin menerima sumber browser ber-URL lokal yang dibuat saat jalan.
 * @param {{ engine: any, load: () => string | null, save: (json: string) => void, newId: (prefix: string) => string, widgetSource?: ((id: string, settings: any) => { kind: string, settings: Record<string, unknown> }) | null }} deps
 */
export function createSceneManager({ engine, load, save, newId, widgetSource = null }) {
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
  const transform = (i) => ({ x: i.x ?? 0, y: i.y ?? 0, scaleX: i.scaleX ?? 1, scaleY: i.scaleY ?? 1, crop: i.crop, visible: i.visible !== false, rotation: i.rotation ?? 0, flipH: i.flipH === true, flipV: i.flipV === true });

  const engineSource = (id, kind, settings) => {
    if (kind !== WIDGET_KIND) return { kind, settings };
    if (!widgetSource) throw fail("widget_unavailable");
    return widgetSource(id, settings);
  };
  const createInEngine = (id, kind, settings) => {
    const e = engineSource(id, kind, settings);
    engine.createSource(id, e.kind, e.settings);
  };

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
          createInEngine(s.id, s.kind, s.settings ?? {});
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

    /** Lepas semua sumber & scene dari mesin (keluar / ganti akun) — koleksi di disk tidak diubah. */
    teardown() {
      for (const sc of state.scenes) engine.removeScene(sc.id);
      for (const src of state.sources) engine.removeSource(src.id);
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
      if (kind === WIDGET_KIND) settings = normalizeWidget(settings);
      settings = sanitizeSourceSettings(kind, settings);
      createInEngine(sourceId, kind, settings);
      const src = { id: sourceId, kind, name: String(name ?? "").slice(0, 80), settings, volume: 1, muted: false, monitoring: "none", filters: [] };
      state.sources.push(src);
      const item = { id: itemId, sourceId, ...place, visible: true, locked: false, rotation: 0, flipH: false, flipV: false };
      engine.addItem(sc.id, itemId, sourceId, transform(item));
      sc.items.push(item);
      persist();
      return { sourceId, itemId };
    },

    updateSource(id, settings) {
      const s = source(id);
      if (!s) throw fail("source_missing");
      s.settings = sanitizeSourceSettings(s.kind, { ...s.settings, ...settings });
      if (s.kind === WIDGET_KIND) s.settings = normalizeWidget(s.settings);
      engine.updateSource(id, engineSource(id, s.kind, s.settings).settings);
      persist();
    },

    /** Semua sumber widget koleksi (untuk hub widget). */
    widgets() {
      return state.sources.filter((s) => s.kind === WIDGET_KIND).map((s) => ({ id: s.id, type: s.settings.widget, settings: s.settings }));
    },

    /** Widget penghitung: "inc" / "dec" / "reset" → nilai baru (tersimpan). */
    counter(id, op) {
      const s = source(id);
      if (!s || s.kind !== WIDGET_KIND || s.settings.widget !== "counter") throw fail("source_missing");
      const value = op === "reset" ? 0 : s.settings.value + (op === "dec" ? -1 : 1);
      s.settings = normalizeWidget({ ...s.settings, value });
      persist();
      return s.settings.value;
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
      if ([0, 90, 180, 270].includes(patch.rotation)) item.rotation = patch.rotation;
      if (typeof patch.flipH === "boolean") item.flipH = patch.flipH;
      if (typeof patch.flipV === "boolean") item.flipV = patch.flipV;
      engine.setItem(sc.id, itemId, transform(item));
      persist();
    },

    /** Terapkan ulang item diputar/dicermin — posisi acuan tengahnya bergantung ukuran sumber. */
    reapplyOriented() {
      for (const sc of state.scenes)
        for (const item of sc.items) {
          if (!isOriented(item)) continue;
          try {
            engine.setItem(sc.id, item.id, transform(item));
          } catch {
            // satu item rusak tidak menghentikan yang lain
          }
        }
    },

    /** "up"/"down" = satu lapisan, "top"/"bottom" = paling atas/bawah. */
    moveItem(itemId, dir) {
      const { scene: sc } = findItem(itemId);
      const i = sc.items.findIndex((x) => x.id === itemId);
      const j = dir === "top" ? sc.items.length - 1 : dir === "bottom" ? 0 : dir === "up" ? i + 1 : i - 1;
      if (j < 0 || j >= sc.items.length || j === i) return;
      const [moved] = sc.items.splice(i, 1);
      sc.items.splice(j, 0, moved);
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
