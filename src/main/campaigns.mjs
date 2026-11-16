// Campaign di Sini Live Studio — proses utama. Daftar dari GET /v1/studio/campaigns?locale=…, gambar diunduh
// di sini dan diteruskan sebagai data: URL (CSP renderer hanya mengizinkan data:). Renderer hanya menerima
// { id, title, image, hasLink }; tautan dibuka dari data milik proses utama sendiri, hanya https.

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const REFRESH_MS = 10 * 60 * 1000;
const MAX_DISMISSED = 100;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);
const isHttps = (u) => typeof u === "string" && /^https:\/\/[^\s/]+/.test(u);

/** Unduh gambar banner: status 2xx, jenis gambar raster, ≤ 3 MB. Melempar kalau tidak memenuhi. */
export async function downloadImage(url, fetchFn = globalThis.fetch) {
  const res = await fetchFn(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`image_status_${res.status}`);
  const contentType = String(res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const length = Number(res.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) throw new Error("image_too_large");
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { contentType, bytes };
}

/** Alamat gambar dari API → alamat absolut yang boleh diunduh, atau null. */
function absolute(origin, url) {
  if (typeof url !== "string") return null;
  if (/^https?:\/\/[^\s/]+/.test(url)) return url;
  if (/^\/(?!\/)/.test(url)) return `${origin.replace(/\/+$/, "")}${url}`;
  return null;
}

/** Gambar dari API (relatif ke origin atau https) → data: URL untuk renderer (CSP hanya data:), atau null kalau gagal. */
export async function imageDataUrl(origin, url, fetchImage) {
  const abs = absolute(origin, url);
  if (!abs) return null;
  try {
    const { contentType, bytes } = await fetchImage(abs);
    if (!IMAGE_TYPES.has(contentType) || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

export function createCampaigns({ http, fetchImage, getLocale, getDismissed, setDismissed, onState, openExternal, intervalMs = REFRESH_MS }) {
  let list = [];
  let state = [];
  let seq = 0;
  let timer = null;
  const images = new Map();

  const project = () => {
    const hidden = new Set(getDismissed());
    state = list.filter((c) => !hidden.has(c.id)).map((c) => ({ id: c.id, title: c.title, image: c.image, hasLink: isHttps(c.linkUrl) }));
    onState(state);
    return state;
  };

  async function imageFor(url) {
    const abs = absolute(http.origin, url);
    if (!abs) return null;
    if (images.has(abs)) return images.get(abs);
    const data = await imageDataUrl(http.origin, abs, fetchImage);
    if (data) images.set(abs, data);
    return data;
  }

  async function refresh() {
    const mine = ++seq;
    let rows;
    try {
      rows = (await http.get(`/studio/campaigns?locale=${encodeURIComponent(getLocale() ?? "")}`)).data;
    } catch {
      return state;
    }
    if (!Array.isArray(rows)) return state;
    const next = [];
    for (const r of rows) {
      if (!r || typeof r.id !== "string" || typeof r.title !== "string") continue;
      const image = await imageFor(r.imageUrl);
      if (image) next.push({ id: r.id, title: r.title, image, linkUrl: typeof r.linkUrl === "string" ? r.linkUrl : "" });
    }
    if (mine !== seq) return state;
    list = next;
    return project();
  }

  return {
    refresh,
    state: () => state,
    /** Mulai saat masuk: ambil sekarang, lalu tiap 10 menit. */
    start() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => void refresh(), intervalMs);
      timer.unref?.();
      return refresh();
    },
    /** Saat keluar: berhenti & kosongkan (jawaban yang masih di jalan dibuang). */
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      seq++;
      list = [];
      images.clear();
      state = [];
      onState(state);
    },
    open(id) {
      const c = list.find((x) => x.id === id);
      if (!c || !isHttps(c.linkUrl)) return false;
      openExternal(c.linkUrl);
      return true;
    },
    dismiss(id) {
      if (!list.some((x) => x.id === id)) return;
      const prev = getDismissed().filter((x) => x !== id);
      setDismissed([...prev, id].slice(-MAX_DISMISSED));
      project();
    },
  };
}
