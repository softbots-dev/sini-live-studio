import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/*
  Kamus aplikasi (dibuat `npm run studio:i18n` dari studio/i18n/*.json, 20 bahasa). Bahasa = pilihan di
  Pengaturan/sambutan (event `locale`, berlaku seketika) atau bahasa Windows; yang tidak didukung → Inggris.
*/
const files = import.meta.glob<Record<string, string>>("./i18n/*.json", { eager: true, import: "default" });
const DICTS: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(files).map(([path, dict]) => [path.replace(/^.*\/(.+)\.json$/, "$1"), dict]),
);

export function pickLocale(raw: string): string {
  const tag = raw.toLowerCase().replace("_", "-");
  if (tag.startsWith("zh")) return /tw|hk|hant|mo/.test(tag) ? "zh-tw" : "zh-cn";
  if (tag.startsWith("pt")) return "pt-br";
  if (tag === "tl" || tag.startsWith("tl-") || tag.startsWith("fil")) return "fil";
  const base = tag.split("-")[0];
  return DICTS[base] ? base : "en";
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Penerjemah murni untuk satu bahasa — dipakai provider aplikasi dan halaman widget. */
export function translator(locale: string): Translate {
  const dict = DICTS[locale] ?? DICTS.en ?? {};
  return (key, params) => {
    const text = dict[key] ?? DICTS.en?.[key] ?? key;
    return params ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? String(params[name]) : all)) : text;
  };
}
const Ctx = createContext<{ locale: string; t: Translate }>({ locale: "en", t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState("en");
  useEffect(() => {
    void window.studio.locale().then((raw) => setLocale(pickLocale(raw)));
    return window.studio.on<string>("locale", (raw) => setLocale(pickLocale(raw)));
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const t = translator(locale);
  return <Ctx.Provider value={{ locale, t }}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
