import { Fragment, type ReactNode } from "react";

/** Tanda "S" Sini (sama dengan public/logo/sini-mark.svg situs) — SVG inline, tanpa aset luar. */
export function SiniMark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 320 320" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <linearGradient id="siniMarkPlay" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a06aff" />
          <stop offset="52%" stopColor="#a06aff" />
          <stop offset="100%" stopColor="#8D52EF" />
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="72" fill="#0F0D14" />
      <g transform="translate(37.82 46.6) scale(0.8129)">
        <g fill="#F5F5F7">
          <path d="M112 8 H279 C281 8 283 9 281 14 C270 47 244 70 210 70 H112 C91 70 78 83 78 101 C78 116 87 126 103 130 C116 133.25 122 142 122 153 V175 C122 176.657 120.657 178 119 178 H95 C43 178 8 147 8 105 C8 68 29 38 60 22 C77 13.226 95 8 112 8 Z" />
          <path d="M241 131 C272 138 293 165 293 195 C293 237 260 271 217 271 H10 C8 271 7 269 8 266 C17 234 45 210 80 210 H201 C223 210 236 198 236 177 V135 C236 131 237 130.097 241 131 Z" />
        </g>
        <path fill="url(#siniMarkPlay)" d="M158 94 L214 131.333 C226 139.333 226 149 214 156 L158 189 C149 194.304 140 188.5 140 180 V104 C140 95 149 88 158 94 Z" />
      </g>
    </svg>
  );
}

/** Nama tiap bahasa dalam bahasanya sendiri (endonim) — urutan sama dengan situs. */
export const LOCALE_NAMES: [code: string, name: string][] = [
  ["id", "Bahasa Indonesia"],
  ["en", "English"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["fil", "Filipino"],
  ["fr", "Français"],
  ["hi", "हिन्दी"],
  ["it", "Italiano"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["ms", "Bahasa Melayu"],
  ["nl", "Nederlands"],
  ["pl", "Polski"],
  ["pt-br", "Português (Brasil)"],
  ["ru", "Русский"],
  ["th", "ไทย"],
  ["tr", "Türkçe"],
  ["vi", "Tiếng Việt"],
  ["zh-cn", "简体中文"],
  ["zh-tw", "繁體中文"],
];

/** Menu native pilihan bahasa (tampil di atas pratinjau native sekalipun). */
export async function openLanguageMenu(t: (key: string) => string) {
  const current = (await window.studio.invoke<{ locale: string | null }>("settings.get"))?.locale ?? null;
  const entries = [
    { id: "system", label: t("studio.app.languageSystem"), checked: current === null },
    { type: "separator" },
    ...LOCALE_NAMES.map(([code, name]) => ({ id: code, label: name, checked: current === code })),
  ];
  const picked = await window.studio.invoke<string | null>("menu.popup", entries);
  if (picked) await window.studio.invoke("settings.setLocale", picked === "system" ? null : picked);
}

/** Teks kamus berplaceholder → node React (mis. "{terms}" menjadi tautan). */
export function rich(template: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return template.split(/\{(\w+)\}/g).map((part, i) => (i % 2 === 1 ? <Fragment key={i}>{nodes[part] ?? `{${part}}`}</Fragment> : part));
}
