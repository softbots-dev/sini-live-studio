import type { Translate } from "../i18n";

/* Event dari hub widget (src/main/widgets/hub.mjs) — bentuknya kontrak antara proses utama dan halaman ini. */
export type Sender = { name: string; avatarUrl: string | null; anonymous: boolean };
export type AlertData = { id: string; sender: Sender; name: string; icon: string | null; quantity: number; soundUrl: string | null; silent: boolean; durationMs: number; sample?: boolean };
export type ChatLine = { id: string; kind: "text" | "gift" | "follow" | "member"; name: string; anonymous: boolean; color: string; body: string; gift?: { name: string; icon: string | null; quantity: number }; sample?: boolean };
export type RankRow = { name: string; avatarUrl: string | null; coins: number };
export type CountdownState = { running: boolean; remainingMs: number; at: number };
export type Settings = Record<string, any>;

export type WidgetProps = { t: Translate; settings: Settings; on: <T>(event: string, fn: (data: T) => void) => () => void };

export const isUrl = (s: string | null | undefined): s is string => typeof s === "string" && /^(https?:)?\/\//i.test(s);
export const titleOf = (settings: Settings, t: Translate, fallbackKey: string) => (typeof settings.title === "string" && settings.title.trim() ? settings.title : t(fallbackKey));
// Format angka mengikuti bahasa studio (bukan bahasa browser OBS) — diatur halaman saat `config` datang.
let numberFormat = new Intl.NumberFormat("en");
export function setNumberLocale(locale: string) {
  try {
    numberFormat = new Intl.NumberFormat(locale);
  } catch {
    numberFormat = new Intl.NumberFormat("en");
  }
}
export const fmt = (n: number) => numberFormat.format(n);
