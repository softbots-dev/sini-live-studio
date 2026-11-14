/*
  Koleksi scene yang disimpan per akun (folder data aplikasi): scene, item (posisi/skala/potong),
  sumber (jenis + pengaturan + filter). Berkas ini TIDAK PERNAH memuat pengaturan layanan atau alamat
  kirim: `parse` dan `serialize` membuang setiap kunci bernama service/server/key/stream* dan setiap
  nilai yang tampak seperti URL rtmp(s), di kedalaman mana pun.
*/
export const MAX_ITEMS_PER_SCENE = 20;
const FORBIDDEN_KEY = /^(service|server|key|stream.*)$/i;
const RTMP = /rtmps?:\/\//i;

function clean(value) {
  if (Array.isArray(value)) return value.map(clean).filter((v) => v !== undefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(k)) continue;
      const c = clean(v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  if (typeof value === "string" && RTMP.test(value)) return undefined;
  return value;
}

export function emptyCollection() {
  return { version: 1, orientation: "landscape", activeSceneId: "scene-1", scenes: [{ id: "scene-1", name: "", items: [] }], sources: [] };
}

const str = (v) => typeof v === "string" && v.length > 0 && v.length <= 200;

export function parse(json) {
  let raw;
  try {
    raw = clean(JSON.parse(json));
  } catch {
    return emptyCollection();
  }
  if (!raw || !Array.isArray(raw.scenes) || !Array.isArray(raw.sources ?? [])) return emptyCollection();
  const scenes = raw.scenes
    .filter((s) => s && str(s.id))
    .map((s) => ({
      id: s.id,
      name: typeof s.name === "string" ? s.name.slice(0, 80) : "",
      items: (Array.isArray(s.items) ? s.items : []).filter((i) => i && str(i.id) && str(i.sourceId)).slice(0, MAX_ITEMS_PER_SCENE),
    }));
  if (scenes.length === 0) return emptyCollection();
  const sources = (raw.sources ?? [])
    .filter((s) => s && str(s.id) && str(s.kind))
    .map((s) => ({ ...s, settings: s.settings && typeof s.settings === "object" ? s.settings : {}, filters: Array.isArray(s.filters) ? s.filters : [] }));
  return {
    version: 1,
    orientation: raw.orientation === "portrait" ? "portrait" : "landscape",
    activeSceneId: scenes.some((s) => s.id === raw.activeSceneId) ? raw.activeSceneId : scenes[0].id,
    scenes,
    sources,
  };
}

export function serialize(state) {
  return JSON.stringify(clean(state), null, 2);
}
