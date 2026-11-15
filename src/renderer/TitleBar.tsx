import type { ReactNode } from "react";
import { useT } from "./i18n";
import { SiniMark } from "./brand";

/*
  Bilah judul milik aplikasi (40 px). Area kosongnya menyeret jendela (`-webkit-app-region: drag`); tombol di
  dalamnya `no-drag`. Tombol minimalkan/maksimalkan/tutup adalah tombol asli Windows (titleBarOverlay) di
  kanan — `padding-right` memberi ruang untuknya.
*/
export function TitleBar({ center, right }: { center?: ReactNode; right?: ReactNode }) {
  const { t } = useT();
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <SiniMark size={22} />
        <span>{t("studio.app.name")}</span>
      </div>
      <div className="titlebar-center">{center}</div>
      <div className="titlebar-right">{right}</div>
    </header>
  );
}
