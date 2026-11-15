/*
  Suara alert gift dari katalog publik (GET /v1/catalog → gifts[].sound):
    "lib:<uuid>"  suara pustaka (unggahan admin) → <origin>/v1/gift-sounds/<uuid>
    "none"        diam
    lainnya       (otomatis / synth / pack web) → suara alert bawaan studio (studio tidak memakai kode web)
  Gift yang belum dikenal memicu muat ulang katalog, paling sering 1× per 60 dtk.
*/
export const RELOAD_MIN_GAP_MS = 60_000;
const LIB = /^lib:([0-9a-f-]{36})$/i;

export function createCatalogSounds({ fetch, origin, now }) {
  const base = String(origin).replace(/\/+$/, "");
  let sounds = new Map();
  let lastLoad = -Infinity;
  let loading = null;

  function load() {
    lastLoad = now();
    loading ??= Promise.resolve()
      .then(fetch)
      .then((data) => {
        const next = new Map();
        for (const g of data?.gifts ?? []) if (g?.id) next.set(g.id, g.sound ?? null);
        sounds = next;
      })
      .catch(() => {})
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  return {
    load,
    soundFor(giftId) {
      if (!sounds.has(giftId)) {
        if (now() - lastLoad >= RELOAD_MIN_GAP_MS) void load();
        return null;
      }
      const choice = sounds.get(giftId) ?? "";
      if (choice === "none") return { url: null, silent: true };
      const lib = LIB.exec(choice);
      return { url: lib ? `${base}/v1/gift-sounds/${lib[1].toLowerCase()}` : null, silent: false };
    },
    clear() {
      sounds = new Map();
      lastLoad = -Infinity;
    },
  };
}
