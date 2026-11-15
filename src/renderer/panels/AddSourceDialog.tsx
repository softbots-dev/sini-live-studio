import { useState } from "react";
import { useT } from "../i18n";
import { Button, Dialog, Field } from "../ui";
import { KIND_META, SOURCE_DEFAULTS, UI_KINDS, type UiKind } from "../kinds";
import type { Result } from "../store";

const ERRORS = new Set(["url_https_only", "file_missing"]);

/*
  Dialog tambah sumber (mockup C): kisi jenis sumber per kelompok (Video / Audio) di kiri, ilustrasi +
  penjelasan jenis terpilih di kanan. Video memilih berkas dulu; Tautan meminta alamat https:// di panel
  kanan. Jenis lain dibuat dengan pengaturan awal lalu dialog pengaturan sumber terbuka (alur lama).
*/
export function AddSourceDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (ids: { sourceId: string; itemId: string }, kind: UiKind) => void }) {
  const { t } = useT();
  const [pick, setPick] = useState<UiKind>("game");
  const [url, setUrl] = useState("https://");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const meta = KIND_META[pick];
  const Icon = meta.icon;

  const add = async () => {
    setError(null);
    let settings: Record<string, unknown> = { ...(SOURCE_DEFAULTS[meta.kind] ?? {}) };
    if (pick === "video") {
      const file = await window.studio.invoke<string | null>("source.pickVideo");
      if (!file) return;
      settings = { ...settings, local_file: file, is_local_file: true, looping: true, restart_on_activate: true };
    }
    if (meta.widget) settings = { widget: meta.widget };
    if (pick === "link") {
      const canvas = await window.studio.invoke<{ width: number; height: number }>("canvas.get");
      settings = { ...settings, url: url.trim(), width: canvas.width, height: canvas.height, reroute_audio: true };
    }
    setBusy(true);
    const r = await window.studio.invoke<Result<{ sourceId: string; itemId: string }>>("source.add", meta.kind, t(`studio.app.ui.${pick}`), settings);
    setBusy(false);
    if (r.ok) onAdded(r.value, pick);
    else setError(r.code === "scene_full" ? t("studio.app.sceneFull") : ERRORS.has(r.code) ? t(`studio.app.err.${r.code}`) : t("studio.app.chat.actionFailed"));
  };

  const group = (g: "video" | "audio" | "widget") => (
    <div className="addsrc-group">
      <h3 className="addsrc-group-title">{t(`studio.app.group.${g}`)}</h3>
      <div className="addsrc-grid" role="radiogroup" aria-label={t(`studio.app.group.${g}`)}>
        {UI_KINDS.filter((k) => KIND_META[k].group === g).map((k) => {
          const KIcon = KIND_META[k].icon;
          return (
            <button key={k} type="button" role="radio" aria-checked={pick === k} className="addsrc-kind" onClick={() => setPick(k)} onDoubleClick={() => void add()}>
              <KIcon aria-hidden />
              <span>{t(`studio.app.ui.${k}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog
      title={t("studio.app.addSource")}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("studio.app.cancel")}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void add()}>
            {t("studio.app.add")}
          </Button>
        </>
      }
    >
      <div className="addsrc">
        <div className="addsrc-list">
          {group("video")}
          {group("audio")}
          {group("widget")}
        </div>
        <div className="addsrc-info" aria-live="polite">
          <div className={`kind-art kind-art-${meta.group}`} aria-hidden>
            <div className="kind-art-screen">
              <Icon />
            </div>
            <div className="kind-art-stand" />
          </div>
          <h3>{t(`studio.app.ui.${pick}`)}</h3>
          <p>{t(`studio.app.uiInfo.${pick}`)}</p>
          {pick === "link" && (
            <Field label={t("studio.app.prop.url")} hint={t("studio.app.prop.urlHint")}>
              {(id) => <input id={id} className="input" type="url" value={url} spellCheck={false} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} />}
            </Field>
          )}
          {error && (
            <p className="msg-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
