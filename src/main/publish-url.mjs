/*
  Alamat kirim dari server (`rtmps://host:443/app/<key>`, docs/phone-live.md) → server + key untuk
  layanan RTMP libobs. Galat tidak pernah memuat isi alamat (isinya rahasia).
*/
export function splitPublishUrl(url) {
  const value = typeof url === "string" ? url.trim() : "";
  const cut = value.lastIndexOf("/");
  const server = cut > 0 ? value.slice(0, cut + 1) : "";
  const key = cut > 0 ? value.slice(cut + 1) : "";
  if (!/^rtmps?:\/\/[^/]+\//.test(server) || !key) throw new Error("publish_invalid");
  return { server, key };
}
