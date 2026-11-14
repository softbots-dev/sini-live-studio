/*
  Origin web Sini yang dipanggil studio (HTTP `/v1`, WebSocket `/realtime`, halaman sambungan).
  Build terpasang SELALU https://sini.live; `SINI_WEB_ORIGIN` hanya berlaku saat pengembangan
  (`npm run dev` terhadap stack lokal).
*/
export const PRODUCTION_ORIGIN = "https://sini.live";

export function webOrigin({ packaged, env }) {
  if (packaged) return PRODUCTION_ORIGIN;
  const raw = String(env?.SINI_WEB_ORIGIN ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+$/.test(raw) ? raw : PRODUCTION_ORIGIN;
}
