import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Plus, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import type { Collection, Scene, Source } from "../screens/Studio";
import { useT } from "../i18n";
import { sourceDialogStore, useSourceDialog, type Result } from "../store";
import { openItemMenu } from "../item-menu";
import { iconForSource, WIDGET_KIND, type UiKind } from "../kinds";
import { WidgetFields } from "./WidgetFields";
import { AddSourceDialog } from "./AddSourceDialog";
import { Button, Dialog, Field, IconButton } from "../ui";
import { sourceCrop, visibleCrop } from "../lib/transform.mjs";
import { confirmAction } from "../confirm";

const FILTERS = ["color_filter", "crop_filter", "chroma_key_filter", "noise_suppress_filter", "noise_gate_filter", "gain_filter", "compressor_filter"] as const;
const AUDIO_ONLY = new Set(["wasapi_input_capture", "wasapi_output_capture"]);


export function SourcesPanel({ collection, scene, selected, onSelect }: { collection: Collection | null; scene: Scene | null; selected: string | null; onSelect: (id: string | null) => void }) {
  const { t } = useT();
  const dialog = useSourceDialog();
  const editing = dialog?.type === "edit" ? dialog.sourceId : null;
  const filtering = dialog?.type === "filters" ? dialog.sourceId : null;
  const adding = dialog?.type === "add";
  const setAdding = (open: boolean) => sourceDialogStore.open(open ? { type: "add" } : null);
  const setEditing = (id: string | null) => sourceDialogStore.open(id ? { type: "edit", sourceId: id } : null);
  const setFiltering = (id: string | null) => sourceDialogStore.open(id ? { type: "filters", sourceId: id } : null);
  const [error, setError] = useState<string | null>(null);
  if (!collection || !scene) return null;
  const source = (id: string) => collection.sources.find((s) => s.id === id);
  const items = [...scene.items].reverse(); // paling atas lebih dulu, seperti OBS

  const run = async (channel: string, ...args: unknown[]) => {
    const r = await window.studio.invoke<Result>(channel, ...args);
    setError(r.ok ? null : r.code === "scene_full" ? t("studio.app.sceneFull") : null);
    return r;
  };

  const showMenu = async (e: React.MouseEvent, item: Scene["items"][number]) => {
    e.preventDefault();
    const src = source(item.sourceId);
    if (!src) return;
    onSelect(item.id);
    void window.studio.invoke("item.select", item.id);
    const [sizes, canvas] = await Promise.all([
      window.studio.invoke<Record<string, { width: number; height: number }>>("item.sizes"),
      window.studio.invoke<{ width: number; height: number }>("canvas.get"),
    ]);
    if (await openItemMenu({ t, item, scene, source: src, size: sizes[item.id] ?? null, canvas })) onSelect(null);
  };

  const added = ({ sourceId, itemId }: { sourceId: string; itemId: string }, kind: UiKind) => {
    setAdding(false);
    setError(null);
    onSelect(itemId);
    void window.studio.invoke("item.select", itemId);
    // Video & Tautan sudah dikonfigurasi di dialog tambah; audio komputer memakai perangkat bawaan.
    if (!["video", "link", "desktopAudio"].includes(kind)) setEditing(sourceId);
  };

  return (
    <div className="sources">
      {items.length === 0 ? (
        <p className="empty">{t("studio.app.emptySources")}</p>
      ) : (
        <ul className="list source-list" aria-label={t("studio.app.sources")}>
          {items.map((item) => {
            const src = source(item.sourceId);
            if (!src) return null;
            const Icon = iconForSource(src);
            return (
              <li key={item.id} className={`list-row source-row ${selected === item.id ? "is-active" : ""} ${item.visible ? "" : "is-muted"}`} onContextMenu={(e) => void showMenu(e, item)}>
                <button
                  type="button"
                  className="list-main"
                  aria-pressed={selected === item.id}
                  onClick={() => {
                    onSelect(item.id);
                    void window.studio.invoke("item.select", item.id);
                  }}
                >
                  <Icon className="source-icon" aria-hidden />
                  <span>{src.name}</span>
                </button>
                <IconButton label={item.visible ? t("studio.app.hide") : t("studio.app.show")} icon={item.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />} onClick={() => void run("item.set", item.id, { visible: !item.visible })} />
                <IconButton label={item.locked ? t("studio.app.unlock") : t("studio.app.lock")} icon={item.locked ? <Lock aria-hidden /> : <LockOpen aria-hidden />} pressed={item.locked} onClick={() => void run("item.set", item.id, { locked: !item.locked })} />
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="secondary" className="add-source-wide" icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
        {t("studio.app.addSource")}
      </Button>
      {error && (
        <p className="msg-warn" role="alert">
          {error}
        </p>
      )}

      {adding && <AddSourceDialog onClose={() => setAdding(false)} onAdded={added} />}
      {editing && source(editing) && (
        <SourceDialog key={editing} source={source(editing)!} item={scene.items.find((i) => i.sourceId === editing) ?? null} onClose={() => setEditing(null)} />
      )}
      {filtering && source(filtering) && <FiltersDialog key={filtering} source={source(filtering)!} onClose={() => setFiltering(null)} />}
    </div>
  );
}

/** Pengaturan satu sumber: nama, perangkat/jendela/teks/gambar, dan potong (crop) itemnya. */
function SourceDialog({ source, item, onClose }: { source: Source; item: Scene["items"][number] | null; onClose: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(source.name);
  const [settings, setSettings] = useState<Record<string, unknown>>(source.settings);
  const [options, setOptions] = useState<{ name: string; value: string | number }[]>([]);
  // Isian potong memakai sisi TERLIHAT (item bisa diputar/dicermin); disimpan per sisi sumber.
  const [crop, setCrop] = useState(() => visibleCrop(item ?? {}));
  const listProp: Record<string, string> = {
    dshow_input: "video_device_id",
    monitor_capture: "monitor_id",
    window_capture: "window",
    game_capture: "window",
    wasapi_input_capture: "device_id",
    wasapi_output_capture: "device_id",
  };
  const prop = listProp[source.kind];

  useEffect(() => {
    if (!prop) return;
    void window.studio.invoke<{ name: string; value: string | number }[]>("source.options", source.id, prop).then(setOptions);
  }, [prop, source.id]);

  const [updateError, setUpdateError] = useState<string | null>(null);
  // Simpanan terakhir yang masih berjalan: Selesai menunggunya (isian Tautan tersimpan saat fokus pindah,
  // yaitu tepat saat tombol Selesai ditekan) — alamat yang ditolak membuat dialog tetap terbuka.
  const pending = useRef<Promise<boolean>>(Promise.resolve(true));
  const set = (patch: Record<string, unknown>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    pending.current = window.studio.invoke<Result>("source.update", source.id, source.kind === WIDGET_KIND ? patch : next).then((r) => {
      const failed = Boolean(r && !r.ok && ["url_https_only", "file_missing"].includes(r.code));
      setUpdateError(failed && r && !r.ok ? t(`studio.app.err.${r.code}`) : null);
      return !failed;
    });
  };

  const save = async () => {
    await new Promise((r) => setTimeout(r, 0)); // biarkan blur isian menjalankan set() dulu
    if (!(await pending.current)) return;
    if (name.trim() && name.trim() !== source.name) void window.studio.invoke("source.rename", source.id, name.trim());
    if (item && !AUDIO_ONLY.has(source.kind)) void window.studio.invoke("item.set", item.id, { crop: sourceCrop(item, crop) });
    onClose();
  };

  const font = (settings.font as { size?: number } | undefined) ?? {};
  const propLabel = source.kind === "dshow_input" || AUDIO_ONLY.has(source.kind) ? t("studio.app.prop.device") : source.kind === "monitor_capture" ? t("studio.app.prop.monitor") : t("studio.app.prop.window");

  return (
    <Dialog
      title={t("studio.app.properties")}
      onClose={onClose}
      wide
      footer={
        <Button variant="primary" onClick={() => void save()}>
          {t("studio.app.done")}
        </Button>
      }
    >
      <Field label={t("studio.app.prop.name")}>{(id) => <input id={id} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>
      {updateError && (
        <p className="msg-error" role="alert">
          {updateError}
        </p>
      )}

      {source.kind === "game_capture" && (
        <Field label={t("studio.app.prop.gameMode")}>
          {(id) => (
            <select id={id} className="input" value={String(settings.capture_mode ?? "any_fullscreen")} onChange={(e) => set({ capture_mode: e.target.value })}>
              <option value="any_fullscreen">{t("studio.app.prop.gameAny")}</option>
              <option value="window">{t("studio.app.prop.gameWindow")}</option>
            </select>
          )}
        </Field>
      )}

      {prop && (source.kind !== "game_capture" || settings.capture_mode === "window") && (
        <Field label={propLabel}>
          {(id) =>
            options.length === 0 ? (
              <p className="hint">
                {t("studio.app.prop.noOptions")}
              </p>
            ) : (
              <select id={id} className="input" value={String(settings[prop] ?? "")} onChange={(e) => set({ [prop]: options.find((o) => String(o.value) === e.target.value)?.value ?? e.target.value })}>
                {AUDIO_ONLY.has(source.kind) && <option value="default">{t("studio.app.prop.default")}</option>}
                {options
                  .filter((o) => String(o.value) !== "default")
                  .map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                      {o.name}
                    </option>
                  ))}
              </select>
            )
          }
        </Field>
      )}

      {source.kind === "text_gdiplus" && (
        <>
          <Field label={t("studio.app.prop.text")}>{(id) => <textarea id={id} className="input" rows={3} value={String(settings.text ?? "")} onChange={(e) => set({ text: e.target.value })} />}</Field>
          <Field label={t("studio.app.prop.fontSize")}>
            {(id) => <input id={id} className="input" type="number" min={8} max={512} value={Number(font.size ?? 96)} onChange={(e) => set({ font: { ...(settings.font as object), size: Number(e.target.value) || 96 } })} />}
          </Field>
        </>
      )}

      {source.kind === "ffmpeg_source" && (
        <>
          <div className="field">
            <span className="field-label">{t("studio.app.prop.videoFile")}</span>
            <p className="hint">{settings.local_file ? String(settings.local_file) : t("studio.app.prop.noVideo")}</p>
            <Button
              onClick={async () => {
                const file = await window.studio.invoke<string | null>("source.pickVideo", t("studio.app.files.video"));
                if (file) set({ local_file: file, is_local_file: true });
              }}
            >
              {t("studio.app.prop.chooseVideo")}
            </Button>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.looping !== false} onChange={(e) => set({ looping: e.target.checked })} />
            {t("studio.app.prop.loop")}
          </label>
        </>
      )}

      {source.kind === "browser_source" && <LinkFields settings={settings} onCommit={(patch) => set(patch)} />}

      {source.kind === WIDGET_KIND && <WidgetFields source={source} settings={settings} onCommit={(patch) => set(patch)} />}

      {source.kind === "image_source" && (
        <div className="field">
          <span className="field-label">{t("studio.app.prop.file")}</span>
          <p className="hint">{settings.file ? String(settings.file) : t("studio.app.prop.noFile")}</p>
          <Button
            onClick={async () => {
              const file = await window.studio.invoke<string | null>("source.pickImage", t("studio.app.files.image"));
              if (file) set({ file });
            }}
          >
            {t("studio.app.prop.chooseFile")}
          </Button>
        </div>
      )}

      {item && !AUDIO_ONLY.has(source.kind) && source.kind !== WIDGET_KIND && (
        <fieldset className="crop">
          <legend>{t("studio.app.prop.crop")}</legend>
          {(["left", "right", "top", "bottom"] as const).map((side) => (
            <Field key={side} label={t(`studio.app.prop.crop${side[0].toUpperCase()}${side.slice(1)}`)}>
              {(id) => <input id={id} className="input" type="number" min={0} max={8000} value={crop[side]} onChange={(e) => setCrop({ ...crop, [side]: Math.max(0, Number(e.target.value) || 0) })} />}
            </Field>
          ))}
        </fieldset>
      )}
    </Dialog>
  );
}

type Filter = { kind: string; settings?: Record<string, unknown> };

/** Filter bawaan libobs — tambah, hapus, dan satu-dua penyetel per jenis. */
function FiltersDialog({ source, onClose }: { source: Source; onClose: () => void }) {
  const { t } = useT();
  const [filters, setFilters] = useState<Filter[]>(source.filters ?? []);
  const audio = AUDIO_ONLY.has(source.kind);
  const allowed = FILTERS.filter((f) => (audio ? ["noise_suppress_filter", "noise_gate_filter", "gain_filter", "compressor_filter"] : ["color_filter", "crop_filter", "chroma_key_filter"]).includes(f));
  const [adding, setAdding] = useState<string>(allowed[0]);

  const commit = (next: Filter[]) => {
    setFilters(next);
    void window.studio.invoke("filters.set", source.id, next);
  };
  const setting = (i: number, key: string, value: unknown) => commit(filters.map((f, j) => (j === i ? { ...f, settings: { ...f.settings, [key]: value } } : f)));
  const num = (f: Filter, key: string, d: number) => (typeof f.settings?.[key] === "number" ? (f.settings[key] as number) : d);

  const slider = (i: number, f: Filter, key: string, label: string, min: number, max: number, step: number, d: number) => (
    <Field label={label}>{(id) => <input id={id} type="range" min={min} max={max} step={step} value={num(f, key, d)} onChange={(e) => setting(i, key, Number(e.target.value))} />}</Field>
  );

  return (
    <Dialog title={t("studio.app.filtersTitle", { name: source.name })} onClose={onClose} wide footer={<Button variant="primary" onClick={onClose}>{t("studio.app.done")}</Button>}>
      {filters.length === 0 && <p className="empty">{t("studio.app.filtersEmpty")}</p>}
      {filters.map((f, i) => (
        <div key={`${f.kind}-${i}`} className="filter-card">
          <div className="filter-head">
            <strong>{t(`studio.app.filter.${f.kind}`)}</strong>
            <IconButton label={t("studio.app.removeFilter")} icon={<Trash2 aria-hidden />} onClick={() => void confirmAction(t, t("studio.app.confirm.removeFilter", { name: t(`studio.app.filter.${f.kind}`) })).then((ok) => ok && commit(filters.filter((_, j) => j !== i)))} />
          </div>
          {f.kind === "color_filter" && (
            <>
              {slider(i, f, "brightness", t("studio.app.f.brightness"), -1, 1, 0.01, 0)}
              {slider(i, f, "contrast", t("studio.app.f.contrast"), -2, 2, 0.01, 0)}
              {slider(i, f, "saturation", t("studio.app.f.saturation"), -1, 5, 0.01, 0)}
            </>
          )}
          {f.kind === "crop_filter" &&
            (["left", "right", "top", "bottom"] as const).map((side) => (
              <Field key={side} label={t(`studio.app.prop.crop${side[0].toUpperCase()}${side.slice(1)}`)}>
                {(id) => <input id={id} className="input" type="number" min={0} value={num(f, side, 0)} onChange={(e) => setting(i, side, Math.max(0, Number(e.target.value) || 0))} />}
              </Field>
            ))}
          {f.kind === "chroma_key_filter" && (
            <>
              <Field label={t("studio.app.f.keyColor")}>
                {(id) => (
                  <select id={id} className="input" value={String(f.settings?.key_color_type ?? "green")} onChange={(e) => setting(i, "key_color_type", e.target.value)}>
                    <option value="green">{t("studio.app.f.green")}</option>
                    <option value="blue">{t("studio.app.f.blue")}</option>
                  </select>
                )}
              </Field>
              {slider(i, f, "similarity", t("studio.app.f.similarity"), 1, 1000, 1, 400)}
            </>
          )}
          {f.kind === "gain_filter" && slider(i, f, "db", t("studio.app.f.gainDb"), -30, 30, 0.5, 0)}
          {f.kind === "noise_gate_filter" && slider(i, f, "open_threshold", t("studio.app.f.threshold"), -96, 0, 1, -26)}
          {f.kind === "compressor_filter" && (
            <>
              {slider(i, f, "ratio", t("studio.app.f.ratio"), 1, 32, 0.5, 10)}
              {slider(i, f, "threshold", t("studio.app.f.threshold"), -60, 0, 1, -18)}
            </>
          )}
        </div>
      ))}
      <div className="row">
        <select className="input" aria-label={t("studio.app.addFilter")} value={adding} onChange={(e) => setAdding(e.target.value)}>
          {allowed.map((k) => (
            <option key={k} value={k}>
              {t(`studio.app.filter.${k}`)}
            </option>
          ))}
        </select>
        <Button icon={<Plus aria-hidden />} onClick={() => commit([...filters, { kind: adding, settings: adding === "noise_suppress_filter" ? { method: "rnnoise" } : {} }])}>
          {t("studio.app.addFilter")}
        </Button>
      </div>
    </Dialog>
  );
}

/** Isian sumber Tautan: alamat (disimpan saat fokus pindah / Enter — divalidasi https di proses utama), lebar & tinggi. */
function LinkFields({ settings, onCommit }: { settings: Record<string, unknown>; onCommit: (patch: Record<string, unknown>) => void }) {
  const { t } = useT();
  const [url, setUrl] = useState(String(settings.url ?? "https://"));
  const commit = () => url.trim() !== settings.url && onCommit({ url: url.trim() });
  return (
    <>
      <Field label={t("studio.app.prop.url")} hint={t("studio.app.prop.urlHint")}>
        {(id) => <input id={id} className="input" type="url" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />}
      </Field>
      <div className="row">
        <Field label={t("studio.app.prop.width")}>
          {(id) => <input id={id} className="input" type="number" min={64} max={3840} value={Number(settings.width ?? 1920)} onChange={(e) => onCommit({ width: Math.min(3840, Math.max(64, Number(e.target.value) || 1920)) })} />}
        </Field>
        <Field label={t("studio.app.prop.height")}>
          {(id) => <input id={id} className="input" type="number" min={64} max={3840} value={Number(settings.height ?? 1080)} onChange={(e) => onCommit({ height: Math.min(3840, Math.max(64, Number(e.target.value) || 1080)) })} />}
        </Field>
      </div>
    </>
  );
}
