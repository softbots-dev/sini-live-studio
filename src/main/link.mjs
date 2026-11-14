/*
  Sambungan lewat browser ("masuk ke TV", docs/live-studio.md): buat tautan, buka halaman setujui di
  browser bawaan, tanya `token` tiap `interval` detik sampai disetujui. Cookie sesi masuk ke jar klien
  HTTP saat jawaban 200 — tidak ada yang perlu dikembalikan selain hasilnya.
*/

/** Bahasa situs Sini (20 bahasa) dari bahasa Windows; selain itu bahasa Inggris. */
const SITE_LOCALES = new Set(["id", "en", "de", "es", "fil", "fr", "hi", "it", "ja", "ko", "ms", "nl", "pl", "pt-br", "ru", "th", "tr", "vi", "zh-cn", "zh-tw"]);
export function siteLocale(raw) {
  const tag = String(raw ?? "").toLowerCase().replace("_", "-");
  if (tag.startsWith("zh")) return /tw|hk|hant|mo/.test(tag) ? "zh-tw" : "zh-cn";
  if (tag.startsWith("pt")) return "pt-br";
  if (tag === "tl" || tag.startsWith("tl-") || tag.startsWith("fil")) return "fil";
  const base = tag.split("-")[0];
  return SITE_LOCALES.has(base) ? base : "en";
}

export const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
export const linkUrl = (origin, locale, linkId) => `${origin.replace(/\/+$/, "")}/${locale}/studio/link/${encodeURIComponent(linkId)}/`;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @returns {Promise<"linked" | "expired" | "cancelled">} */
export async function runLink({ http, locale, openExternal, onCode, signal, sleep = defaultSleep }) {
  const { data } = await http.post("/studio/link", { platform: "windows" });
  onCode(formatCode(data.code));
  await openExternal(linkUrl(http.origin, locale, data.linkId));
  const every = Math.max(1, Number(data.interval) || 2) * 1000;
  for (;;) {
    if (signal?.aborted) return "cancelled";
    await sleep(every);
    if (signal?.aborted) return "cancelled";
    try {
      const out = await http.post("/studio/link/token", { pollToken: data.pollToken });
      if (out.status === 200) return "linked";
    } catch (err) {
      if (err?.status === 410) return "expired";
      if (err?.status === 429) {
        await sleep(err.retryAfterMs ?? every);
        continue;
      }
      throw err;
    }
  }
}
