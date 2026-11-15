import type { Item, Scene, Source } from "./screens/Studio";
import { presetTransform, type Preset, type Size } from "./lib/transform.mjs";
import { sourceDialogStore } from "./store";

type T = (key: string, vars?: Record<string, string | number>) => string;
const AUDIO_ONLY = new Set(["wasapi_input_capture", "wasapi_output_capture"]);
const PRESETS: Preset[] = ["fit", "stretch", "center", "reset"];

/*
  Menu klik kanan sebuah item (pratinjau & daftar sumber), seperti OBS: urutan lapisan, transformasi,
  sembunyikan, kunci, pengaturan, filter, hapus. Menu native (proses utama) supaya tampil di atas jendela
  pratinjau. Menjawab true kalau item dihapus (pemanggil melepas pilihannya).
*/
export async function openItemMenu({ t, item, scene, source, size, canvas }: { t: T; item: Item; scene: Scene; source: Source; size: Size | null; canvas: Size }): Promise<boolean> {
  const index = scene.items.findIndex((i) => i.id === item.id);
  const atTop = index === scene.items.length - 1;
  const atBottom = index === 0;
  const visual = !AUDIO_ONLY.has(source.kind) && size !== null && size.width > 0 && size.height > 0;
  const entries = [
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
      submenu: PRESETS.map((p) => ({ id: `t:${p}`, label: t(`studio.app.menu.${p}`), enabled: visual && !item.locked })),
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
  if (!id) return false;
  if (["top", "up", "down", "bottom"].includes(id)) await window.studio.invoke("item.move", item.id, id);
  else if (id.startsWith("t:") && size) await window.studio.invoke("item.set", item.id, presetTransform(id.slice(2) as Preset, item, size, canvas));
  else if (id === "visible") await window.studio.invoke("item.set", item.id, { visible: !item.visible });
  else if (id === "lock") await window.studio.invoke("item.set", item.id, { locked: !item.locked });
  else if (id === "edit") sourceDialogStore.open({ type: "edit", sourceId: source.id });
  else if (id === "filters") sourceDialogStore.open({ type: "filters", sourceId: source.id });
  else if (id === "delete") {
    await window.studio.invoke("item.remove", item.id);
    return true;
  }
  return false;
}
