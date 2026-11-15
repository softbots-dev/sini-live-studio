/*
  Widget Sini Live Studio (docs/live-studio.md § Widget): jenis, ukuran halaman bawaan, dan pengaturan per jenis.
  Disimpan di koleksi scene sebagai sumber `sini_widget`; nilai di luar batas dijepit di sini — satu-satunya
  tempat batasnya. Nama field tidak boleh cocok dengan pola yang dibuang koleksi (service|server|key|stream*).
*/
export const WIDGET_KIND = "sini_widget";
export const WIDGET_TYPES = ["alert", "goal", "counter", "countdown", "ranking", "chatbox"];
export const WIDGET_SIZES = {
  alert: { width: 800, height: 300 },
  goal: { width: 800, height: 140 },
  counter: { width: 500, height: 160 },
  countdown: { width: 500, height: 160 },
  ranking: { width: 500, height: 520 },
  chatbox: { width: 500, height: 700 },
};
export const GOAL_KINDS = ["coins", "gifts", "followers", "members"];
const FONT_SIZES = ["small", "medium", "large"];

const int = (v, fallback, min, max) => {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};
const title = (v) => (typeof v === "string" ? v.slice(0, 60) : "");
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

export function normalizeWidget(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const widget = WIDGET_TYPES.includes(s.widget) ? s.widget : "counter";
  switch (widget) {
    case "alert":
      return { widget, durationSec: int(s.durationSec, 5, 3, 15), minCoins: int(s.minCoins, 1, 1, 1e9), sound: s.sound !== false };
    case "goal":
      return { widget, goal: pick(s.goal, GOAL_KINDS, "coins"), target: int(s.target, 100, 1, 1e12), title: title(s.title) };
    case "countdown":
      return { widget, title: title(s.title), durationSec: int(s.durationSec, 300, 1, 86400) };
    case "ranking":
      return { widget, title: title(s.title), rows: int(s.rows, 5, 3, 10) };
    case "chatbox":
      return { widget, fontSize: pick(s.fontSize, FONT_SIZES, "medium"), rows: int(s.rows, 8, 3, 15), showEvents: s.showEvents !== false };
    default:
      return { widget, title: title(s.title), value: int(s.value, 0, -1e9, 1e9) };
  }
}
