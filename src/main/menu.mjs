/*
  Menu klik kanan native. Renderer mengirim daftar entri (teks sudah diterjemahkan); di sini disaring menjadi
  templat Electron yang HANYA berisi label, id, centang, nonaktif, pemisah, dan satu tingkat submenu — tidak ada
  `role` atau properti lain dari renderer. Menu native dipakai karena pratinjau adalah jendela native di atas
  halaman: menu HTML akan tertutup olehnya.
*/
const MAX = 40;

function entry(e, onPick, depth) {
  if (!e || typeof e !== "object") return null;
  if (e.type === "separator") return { type: "separator" };
  const label = typeof e.label === "string" ? e.label.slice(0, 80) : "";
  if (Array.isArray(e.submenu) && depth === 0) return { label, submenu: list(e.submenu, onPick, 1) };
  const id = typeof e.id === "string" ? e.id.slice(0, 40) : null;
  const out = { label, enabled: e.enabled !== false && id !== null, click: () => id && onPick(id) };
  if (typeof e.checked === "boolean") Object.assign(out, { type: "checkbox", checked: e.checked });
  return out;
}

function list(entries, onPick, depth) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, MAX).map((e) => entry(e, onPick, depth)).filter(Boolean);
}

/** @param {unknown} entries @param {(id: string) => void} onPick */
export function menuTemplate(entries, onPick) {
  return list(entries, onPick, 0);
}
