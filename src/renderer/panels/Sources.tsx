import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Plus, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import type { Collection, Scene, Source } from "../screens/Studio";
import { useT } from "../i18n";
import { sourceDialogStore, useSourceDialog, type Result } from "../store";
import { openItemMenu } from "../item-menu";
import { Button, Dialog, Field, IconButton } from "../ui";

export const KINDS = ["dshow_input", "monitor_capture", "window_capture", "game_capture", "wasapi_input_capture", "wasapi_output_capture", "image_source", "text_gdiplus"] as const;
const FILTERS = ["color_filter", "crop_filter", "chroma_key_filter", "noise_suppress_filter", "noise_gate_filter", "gain_filter", "compressor_filter"] as const;
const AUDIO_ONLY = new Set(["wasapi_input_capture", "wasapi_output_capture"]);

/** Pengaturan awal per jenis sumber (pengguna memilih perangkat/jendela di dialog setelahnya). */
const DEFAULTS: Record<string, Record<string, unknown>> = {
  wasapi_input_capture: { device_id: "default" },
  wasapi_output_capture: { device_id: "default" },
  game_capture: { capture_mode: "any_fullscreen" },
  text_gdiplus: { text: "Sini", font: { face: "Arial", size: 96, style: "Regular", flags: 0 }, color: 0xffffffff },
};

export function SourcesPanel({ collection, scene, selected, onSelect }: { collection: Collection | null; scene: Scene | null; selected: string | null; onSelect: (id: string | null) => void }) {
  const { t } = useT();
  const [adding, setAdding] = useState(false);
  const dialog = useSourceDialog();
  const editing = dialog?.type === "edit" ? dialog.sourceId : null;
  const filtering = dialog?.type === "filters" ? dialog.sourceId : null;
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

  const add = async (kind: string) => {
    setAdding(false);
    const r = await run("source.add", kind, t(`studio.app.kind.${kind}`), DEFAULTS[kind] ?? {});
    if (r.ok) {
      const { sourceId, itemId } = r.value as { sourceId: string; itemId: string };
      onSelect(itemId);
      void window.studio.invoke("item.select", itemId);
      if (kind !== "wasapi_output_capture") setEditing(sourceId);
    }
  };

  return (
    <section className="panel panel-grow" aria-labelledby="sources-title">
      <header className="panel-head">
        <h2 id="sources-title">{t("studio.app.sources")}</h2>
        <IconButton label={t("studio.app.addSource")} icon={<Plus aria-hidden />} onClick={() => setAdding(true)} />
      </header>
      {items.length === 0 ? (
        <p className="empty">{t("studio.app.emptySources")}</p>
      ) : (
        <ul className="list" aria-labelledby="sources-title">
          {items.map((item) => {
            const src = source(item.sourceId);
            if (!src) return null;
            return (
              <li key={item.id} className={`list-row ${selected === item.id ? "is-active" : ""} ${item.visible ? "" : "is-muted"}`} onContextMenu={(e) => void showMenu(e, item)}>
                <button
                  type="button"
                  className="list-main"
                  aria-pressed={selected === item.id}
                  onClick={() => {
                    onSelect(item.id);
                    void window.studio.invoke("item.select", item.id);
                  }}
                >
                  {src.name}
                </button>
                <IconButton label={item.visible ? t("studio.app.hide") : t("studio.app.show")} icon={item.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />} onClick={() => void run("item.set", item.id, { visible: !item.visible })} />
                <IconButton label={item.locked ? t("studio.app.unlock") : t("studio.app.lock")} icon={item.locked ? <Lock aria-hidden /> : <LockOpen aria-hidden />} pressed={item.locked} onClick={() => void run("item.set", item.id, { locked: !item.locked })} />
              </li>
            );
          })}
        </ul>
      )}
      {(() => {
        const idx = items.findIndex((x) => x.id === selected);
        const item = idx >= 0 ? items[idx] : null;
        const src = item ? source(item.sourceId) : null;
        if (!item || !src) return null;
        return (
          <div className="panel-tools" role="toolbar" aria-label={src.name}>
            <IconButton label={t("studio.app.moveUp")} icon={<ArrowUp aria-hidden />} disabled={idx === 0} onClick={() => void run("item.move", item.id, "up")} />
            <IconButton label={t("studio.app.moveDown")} icon={<ArrowDown aria-hidden />} disabled={idx === items.length - 1} onClick={() => void run("item.move", item.id, "down")} />
            <IconButton label={t("studio.app.properties")} icon={<Settings2 aria-hidden />} onClick={() => setEditing(src.id)} />
            <IconButton label={t("studio.app.filters")} icon={<SlidersHorizontal aria-hidden />} onClick={() => setFiltering(src.id)} />
            <IconButton
              label={t("studio.app.delete")}
              icon={<Trash2 aria-hidden />}
              onClick={() => {
                onSelect(null);
                void run("item.remove", item.id);
              }}
            />
          </div>
        );
      })()}
      {error && (
        <p className="msg-warn" role="alert">
          {error}
        </p>
      )}

      {adding && (
        <Dialog title={t("studio.app.addSource")} onClose={() => setAdding(false)}>
          <div className="kind-grid">
            {KINDS.map((k) => (
              <Button key={k} variant="secondary" onClick={() => void add(k)}>
                {t(`studio.app.kind.${k}`)}
              </Button>
            ))}
          </div>
        </Dialog>
      )}
      {editing && source(editing) && (
        <SourceDialog key={editing} source={source(editing)!} item={scene.items.find((i) => i.sourceId === editing) ?? null} onClose={() => setEditing(null)} />
      )}
      {filtering && source(filtering) && <FiltersDialog key={filtering} source={source(filtering)!} onClose={() => setFiltering(null)} />}
    </section>
  );
}

/** Pengaturan satu sumber: nama, perangkat/jendela/teks/gambar, dan potong (crop) itemnya. */
function SourceDialog({ source, item, onClose }: { source: Source; item: Scene["items"][number] | null; onClose: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(source.name);
  const [settings, setSettings] = useState<Record<string, unknown>>(source.settings);
  const [options, setOptions] = useState<{ name: string; value: string | number }[]>([]);
  const [crop, setCrop] = useState(item?.crop ?? { left: 0, right: 0, top: 0, bottom: 0 });
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

  const set = (patch: Record<string, unknown>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void window.studio.invoke("source.update", source.id, patch);
  };

  const save = () => {
    if (name.trim() && name.trim() !== source.name) void window.studio.invoke("source.rename", source.id, name.trim());
    if (item && !AUDIO_ONLY.has(source.kind)) void window.studio.invoke("item.set", item.id, { crop });
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
        <Button variant="primary" onClick={save}>
          {t("studio.app.done")}
        </Button>
      }
    >
      <Field label={t("studio.app.prop.name")}>{(id) => <input id={id} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>

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
              <p id={id} className="hint">
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

      {source.kind === "image_source" && (
        <div className="field">
          <span className="field-label">{t("studio.app.prop.file")}</span>
          <p className="hint">{settings.file ? String(settings.file) : t("studio.app.prop.noFile")}</p>
          <Button
            onClick={async () => {
              const file = await window.studio.invoke<string | null>("source.pickImage");
              if (file) set({ file });
            }}
          >
            {t("studio.app.prop.chooseFile")}
          </Button>
        </div>
      )}

      {item && !AUDIO_ONLY.has(source.kind) && (
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
            <IconButton label={t("studio.app.removeFilter")} icon={<Trash2 aria-hidden />} onClick={() => commit(filters.filter((_, j) => j !== i))} />
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
