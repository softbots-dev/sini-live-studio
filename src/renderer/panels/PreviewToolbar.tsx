import { ArrowDown, ArrowUp, ChevronDown, Crop, FlipHorizontal2, Maximize2, Move, RotateCw, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Collection, Scene } from "../screens/Studio";
import { useT } from "../i18n";
import { flipEntries, isVisual, loadGeometry, presetEntries, runItemAction, POSITION_PRESETS, SIZE_PRESETS, type ItemContext } from "../item-menu";

/*
  Toolbar di atas pratinjau (di luar area jendela native) untuk sumber visual yang terpilih: ukuran,
  posisi, mode potong, putar 90°, cermin, naik/turun lapisan, pengaturan, filter, hapus. Dropdown = menu
  native. Item terkunci: tombol posisi/ukuran nonaktif ("Buka kunci dulu"). Barisnya selalu ada (tinggi
  tetap) supaya pratinjau tidak melompat saat memilih/melepas sumber.
*/
export function PreviewToolbar({ collection, scene, selected, cropMode, onCropMode, onDeselect }: { collection: Collection | null; scene: Scene | null; selected: string | null; cropMode: boolean; onCropMode: (on: boolean) => void; onDeselect: () => void }) {
  const { t } = useT();
  const item = scene?.items.find((i) => i.id === selected) ?? null;
  const source = item ? collection?.sources.find((s) => s.id === item.sourceId) ?? null : null;
  const visualKind = source ? !["wasapi_input_capture", "wasapi_output_capture"].includes(source.kind) : false;
  // Putar butuh ukuran sumber (pusat putaran); sumber yang belum tampil (mis. jendela tertutup) belum punya.
  const [hasSize, setHasSize] = useState(true);
  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Selama belum punya ukuran, periksa lagi tiap detik (mis. jendela yang ditangkap baru dibuka).
    const check = () =>
      void loadGeometry(itemId).then((g) => {
        if (!alive) return;
        const ok = Boolean(g.size && g.size.width > 0 && g.size.height > 0);
        setHasSize(ok);
        if (!ok) timer = setTimeout(check, 1000);
      });
    check();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [itemId, scene]);
  if (!item || !source || !scene || !visualKind) return <div className="ptool-row" aria-hidden />;

  const locked = item.locked;
  const index = scene.items.findIndex((i) => i.id === item.id);
  const lockHint = locked ? t("studio.app.unlockFirst") : undefined;

  const context = async (): Promise<ItemContext> => ({ item, scene, source, ...(await loadGeometry(item.id)) });
  const run = async (id: string) => {
    if (await runItemAction(id, await context())) onDeselect();
  };
  const menu = async (entries: (ctx: ItemContext) => unknown[]) => {
    const ctx = await context();
    const id = await window.studio.invoke<string | null>("menu.popup", entries(ctx));
    if (id && (await runItemAction(id, ctx))) onDeselect();
  };

  const Tool = ({ label, icon, onClick, disabled, pressed, dropdown }: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; pressed?: boolean; dropdown?: boolean }) => (
    <button type="button" className={`ptool-btn ${dropdown ? "has-dd" : ""}`} aria-label={label} title={disabled && lockHint ? `${label} — ${lockHint}` : label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      {icon}
      {dropdown && <ChevronDown className="dd" aria-hidden />}
    </button>
  );

  return (
    <div className="ptool-row">
      <div className="ptool" role="toolbar" aria-label={t("studio.app.toolbar")}>
        <Tool label={t("studio.app.tb.fit")} icon={<Maximize2 aria-hidden />} dropdown disabled={locked} onClick={() => void menu((c) => presetEntries(t, SIZE_PRESETS, isVisual(c)))} />
        <Tool label={t("studio.app.tb.position")} icon={<Move aria-hidden />} dropdown disabled={locked} onClick={() => void menu((c) => presetEntries(t, POSITION_PRESETS, isVisual(c)))} />
        <Tool label={t("studio.app.tb.crop")} icon={<Crop aria-hidden />} pressed={cropMode} disabled={locked} onClick={() => onCropMode(!cropMode)} />
        <Tool label={t("studio.app.tb.rotate")} icon={<RotateCw aria-hidden />} disabled={locked || !hasSize} onClick={() => void run("rotate")} />
        <Tool label={t("studio.app.tb.flip")} icon={<FlipHorizontal2 aria-hidden />} dropdown disabled={locked} onClick={() => void menu((c) => flipEntries(t, item, isVisual(c)))} />
        <span className="ptool-sep" aria-hidden />
        <Tool label={t("studio.app.moveUp")} icon={<ArrowUp aria-hidden />} disabled={index === scene.items.length - 1} onClick={() => void run("up")} />
        <Tool label={t("studio.app.moveDown")} icon={<ArrowDown aria-hidden />} disabled={index === 0} onClick={() => void run("down")} />
        <span className="ptool-sep" aria-hidden />
        <Tool label={t("studio.app.properties")} icon={<Settings2 aria-hidden />} onClick={() => void run("edit")} />
        <Tool label={t("studio.app.filters")} icon={<SlidersHorizontal aria-hidden />} onClick={() => void run("filters")} />
        <Tool label={t("studio.app.delete")} icon={<Trash2 aria-hidden />} onClick={() => void run("delete")} />
      </div>
    </div>
  );
}
