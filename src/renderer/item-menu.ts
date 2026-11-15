import type { Item, Scene, Source } from "./screens/Studio";
import { flipItem, presetTransform, rotateItem, type Preset, type Size } from "./lib/transform.mjs";
import { sourceDialogStore } from "./store";
import { AUDIO_KINDS, WIDGET_KIND } from "./kinds";

type T = (key: string, vars?: Record<string, string | number>) => string;
export type ItemContext = { item: Item; scene: Scene; source: Source; size: Size | null; canvas: Size };

export const SIZE_PRESETS: Preset[] = ["fit", "stretch", "reset"];
export const POSITION_PRESETS: Preset[] = ["center", "centerH", "centerV", "left", "right", "top", "bottom"];

/** Ukuran sumber & kanvas terkini dari proses utama (untuk preset). */
export async function loadGeometry(itemId: string): Promise<{ size: Size | null; canvas: Size }> {
  const [sizes, canvas] = await Promise.all([window.studio.invoke<Record<string, Size>>("item.sizes"), window.studio.invoke<Size>("canvas.get")]);
  return { size: sizes[itemId] ?? null, canvas };
}

export const isVisual = (ctx: { source: Source; size: Size | null }) => !AUDIO_KINDS.has(ctx.source.kind) && ctx.size !== null && ctx.size.width > 0 && ctx.size.height > 0;

/**
 * Satu aksi item — dipakai menu klik kanan DAN toolbar pratinjau supaya keduanya selalu sama.
 * Menjawab true kalau item dihapus (pemanggil melepas pilihannya).
 */
export async function runItemAction(id: string, ctx: ItemContext): Promise<boolean> {
  const { item, source, size, canvas } = ctx;
  if (["top", "up", "down", "bottom"].includes(id)) await window.studio.invoke("item.move", item.id, id);
  else if (id.startsWith("t:") && size) await window.studio.invoke("item.set", item.id, presetTransform(id.slice(2) as Preset, item, size, canvas));
  else if (id === "rotate" && size) await window.studio.invoke("item.set", item.id, rotateItem(item, size));
  else if (id === "flipH" || id === "flipV") await window.studio.invoke("item.set", item.id, flipItem(item, id === "flipH" ? "h" : "v"));
  else if (id === "visible") await window.studio.invoke("item.set", item.id, { visible: !item.visible });
  else if (id === "lock") await window.studio.invoke("item.set", item.id, { locked: !item.locked });
  else if (id === "edit") sourceDialogStore.open({ type: "edit", sourceId: source.id });
  else if (id === "filters") sourceDialogStore.open({ type: "filters", sourceId: source.id });
  else if (id === "w:inc" || id === "w:dec" || id === "w:reset") await window.studio.invoke("widget.counter", source.id, id.slice(2));
  else if (id === "w:toggle") await window.studio.invoke("widget.countdown", source.id, "toggle");
  else if (id === "w:creset") await window.studio.invoke("widget.countdown", source.id, "reset");
  else if (id === "delete") {
    await window.studio.invoke("item.remove", item.id);
    return true;
  }
  return false;
}

/** Entri menu preset (ukuran / posisi) untuk menu native. */
export function presetEntries(t: T, presets: Preset[], enabled: boolean) {
  return presets.map((p) => ({ id: `t:${p}`, label: t(`studio.app.menu.${p}`), enabled }));
}
export function flipEntries(t: T, item: Item, enabled: boolean) {
  return [
    { id: "flipH", label: t("studio.app.menu.flipH"), checked: Boolean(item.flipH), enabled },
    { id: "flipV", label: t("studio.app.menu.flipV"), checked: Boolean(item.flipV), enabled },
  ];
}

/*
  Menu klik kanan sebuah item (pratinjau & daftar sumber), seperti OBS: urutan lapisan, transformasi,
  sembunyikan, kunci, pengaturan, filter, hapus. Menu native (proses utama) supaya tampil di atas jendela
  pratinjau. Menjawab true kalau item dihapus (pemanggil melepas pilihannya).
*/
export async function openItemMenu({ t, ...ctx }: { t: T } & ItemContext): Promise<boolean> {
  const { item, scene } = ctx;
  const index = scene.items.findIndex((i) => i.id === item.id);
  const atTop = index === scene.items.length - 1;
  const atBottom = index === 0;
  const movable = isVisual(ctx) && !item.locked;
  const widget = ctx.source.kind === WIDGET_KIND ? String(ctx.source.settings.widget ?? "") : "";
  const countdown = widget === "countdown" ? await window.studio.invoke<{ running: boolean } | null>("widget.countdownState", ctx.source.id) : null;
  const widgetEntries =
    widget === "counter"
      ? [{ id: "w:inc", label: t("studio.app.widget.inc") }, { id: "w:dec", label: t("studio.app.widget.dec") }, { id: "w:reset", label: t("studio.app.widget.reset") }, { type: "separator" }]
      : widget === "countdown"
        ? [{ id: "w:toggle", label: t(countdown?.running ? "studio.app.widget.pause" : "studio.app.widget.start") }, { id: "w:creset", label: t("studio.app.widget.reset") }, { type: "separator" }]
        : [];
  const entries = [
    ...widgetEntries,
    {
      label: t("studio.app.menu.order"),
      submenu: [
        { id: "top", label: t("studio.app.menu.toTop"), enabled: !atTop },
        { id: "up", label: t("studio.app.moveUp"), enabled: !atTop },
        { id: "down", label: t("studio.app.moveDown"), enabled: !atBottom },
        { id: "bottom", label: t("studio.app.menu.toBottom"), enabled: !atBottom },
      ],
    },
    {
      label: t("studio.app.menu.transform"),
      submenu: [...presetEntries(t, ["fit", "stretch", "center", "reset"], movable), { type: "separator" }, { id: "rotate", label: t("studio.app.tb.rotate"), enabled: movable }, ...flipEntries(t, item, movable)],
    },
    { type: "separator" },
    { id: "visible", label: item.visible ? t("studio.app.hide") : t("studio.app.show") },
    { id: "lock", label: t("studio.app.lock"), checked: item.locked },
    { type: "separator" },
    { id: "edit", label: t("studio.app.properties") },
    { id: "filters", label: t("studio.app.filters") },
    { type: "separator" },
    { id: "delete", label: t("studio.app.delete") },
  ];
  const id = await window.studio.invoke<string | null>("menu.popup", entries);
  return id ? runItemAction(id, ctx) : false;
}
