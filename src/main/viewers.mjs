/*
  Tab Penonton (proses utama). Daftarnya dari gateway: `room.viewers` lewat soket room channel sendiri —
  hanya pengguna MASUK, pemilik tidak dihitung, maks. 300 orang (sisanya `more`), urutan dari server
  (staf, moderator, member, terverifikasi, nama). Gateway mengulang jawaban yang sama kalau diminta lagi
  dalam 3 dtk, jadi renderer boleh meminta saat tab dibuka, tiap 15 dtk, dan dari tombol muat ulang.

  Foto penonton: renderer hanya boleh memuat data: URL (CSP), jadi proses utama mengunduh THUMBNAIL kecil
  (`/v1/media/thumb/96/<kunci>`, sama dengan web lib/thumb.ts) — bukan foto aslinya yang bisa 2 MB — dengan
  paralel terbatas, dan menyimpan hasilnya (juga yang gagal) supaya refresh berikutnya tidak mengunduh ulang.
*/
export const VIEWERS_REFRESH_MS = 15_000;
const THUMB_WIDTH = 96;
const KEY = /(\d{4}\/\d{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp|gif))(?:[?#].*)?$/;
const CACHE_LIMIT = 600;

/** Alamat foto dari API → thumbnail 96 px kalau unggahan Sini; tautan luar (foto Google) apa adanya. */
export function avatarThumb(url) {
  if (typeof url !== "string" || !url) return null;
  const key = KEY.exec(url)?.[1];
  return key ? `/v1/media/thumb/${THUMB_WIDTH}/${key}` : url;
}

const EMPTY = Object.freeze({ status: "idle", total: 0, more: 0, viewers: [] });
const count = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const text = (s) => (typeof s === "string" ? s : "");

export function createViewers({ request, loadAvatar, onChange, concurrency = 4 }) {
  let state = EMPTY;
  /** Baris mentah terakhir (alamat foto asli) — dipakai menempelkan foto yang selesai diunduh. */
  let rows = [];
  let generation = 0;
  const cache = new Map();
  const inflight = new Set();
  const queue = [];
  let active = 0;

  function build() {
    return rows.map((r) => {
      const thumb = avatarThumb(r.avatarUrl);
      return { id: r.id, username: r.username, displayName: r.displayName, color: r.color, badges: r.badges, avatar: (thumb && cache.get(thumb)) || null };
    });
  }
  function publish() {
    state = { ...state, viewers: build() };
    onChange();
  }

  function remember(url, value) {
    cache.set(url, value);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
  function pump() {
    while (active < concurrency && queue.length) {
      const url = queue.shift();
      const gen = generation;
      active++;
      Promise.resolve()
        .then(() => loadAvatar(url))
        .catch(() => null)
        .then((value) => {
          active--;
          inflight.delete(url);
          remember(url, typeof value === "string" && value.startsWith("data:image/") ? value : null);
          if (gen === generation && rows.some((r) => avatarThumb(r.avatarUrl) === url)) publish();
          pump();
        });
    }
  }
  function want(url) {
    if (!url || cache.has(url) || inflight.has(url)) return;
    inflight.add(url);
    queue.push(url);
  }

  return {
    snapshot: () => state,
    /** Minta daftar terbaru. false = soket belum tersambung (renderer menampilkan menyambungkan). */
    refresh() {
      if (!request()) return false;
      if (state.status === "idle") {
        state = { ...state, status: "loading" };
        onChange();
      }
      return true;
    },
    apply(msg) {
      if (msg?.type !== "room.viewers" || !msg.data || typeof msg.data !== "object") return;
      const list = Array.isArray(msg.data.viewers) ? msg.data.viewers : [];
      rows = list
        .filter((v) => v && typeof v.id === "string" && v.id && typeof v.username === "string")
        .map((v) => ({
          id: v.id,
          username: v.username,
          displayName: text(v.displayName) || v.username,
          color: text(v.color),
          badges: Array.isArray(v.badges) ? v.badges.filter((b) => typeof b === "string") : [],
          avatarUrl: text(v.avatarUrl),
        }));
      state = { status: "ready", total: count(msg.data.total), more: count(msg.data.more), viewers: [] };
      for (const r of rows) want(avatarThumb(r.avatarUrl));
      publish();
      pump();
    },
    /** Keluar / ganti channel: daftar dibuang; unduhan yang masih jalan tidak menghidupkannya lagi. */
    reset() {
      generation++;
      rows = [];
      queue.length = 0;
      for (const url of inflight) if (!cache.has(url)) inflight.delete(url);
      state = EMPTY;
    },
  };
}
