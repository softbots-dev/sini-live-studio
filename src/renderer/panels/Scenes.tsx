import { useState } from "react";
import { ChevronDown, Ellipsis } from "lucide-react";
import type { Collection } from "../screens/Studio";
import { useT } from "../i18n";
import type { Result } from "../store";
import { Button, Dialog, Field, IconButton } from "../ui";

/** Nama scene untuk tampilan (scene tanpa nama = "Scene N"). */
export function sceneLabel(t: (k: string, p?: Record<string, string | number>) => string, name: string, i: number) {
  return name || t("studio.app.sceneDefault", { n: i + 1 });
}

/** Menu native: pindah scene + tambah scene. Dipakai baris scene dan bilah kontrol bawah. */
export async function openSceneMenu(t: (k: string, p?: Record<string, string | number>) => string, collection: Collection) {
  const entries = [
    ...collection.scenes.map((s, i) => ({ id: `scene:${s.id}`, label: sceneLabel(t, s.name, i), checked: s.id === collection.activeSceneId })),
    { type: "separator" },
    { id: "add", label: t("studio.app.addScene") },
  ];
  const picked = await window.studio.invoke<string | null>("menu.popup", entries);
  if (picked === "add") await window.studio.invoke("scene.add", t("studio.app.sceneDefault", { n: collection.scenes.length + 1 }));
  else if (picked?.startsWith("scene:")) await window.studio.invoke("scene.activate", picked.slice(6));
}

/*
  Baris scene di kolom kiri: nama scene aktif + panah (menu pilih/tambah scene) dan ⋯ (ganti nama / hapus).
  Semua menu native — tampil di atas jendela pratinjau.
*/
export function SceneBar({ collection }: { collection: Collection }) {
  const { t } = useT();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const index = Math.max(0, collection.scenes.findIndex((s) => s.id === collection.activeSceneId));
  const active = collection.scenes[index];
  const name = active ? sceneLabel(t, active.name, index) : "";

  const options = async () => {
    const picked = await window.studio.invoke<string | null>("menu.popup", [
      { id: "rename", label: t("studio.app.rename") },
      { id: "delete", label: t("studio.app.delete"), enabled: collection.scenes.length > 1 },
    ]);
    if (picked === "rename" && active) setRenaming({ id: active.id, name });
    if (picked === "delete" && active) {
      const r = await window.studio.invoke<Result>("scene.remove", active.id);
      setError(r.ok ? null : r.code === "last_scene" ? t("studio.app.lastScene") : null);
    }
  };

  return (
    <div className="scene-bar">
      <button type="button" className="scene-pick" aria-label={t("studio.app.chooseScene")} onClick={() => void openSceneMenu(t, collection)}>
        <span>{name}</span>
        <ChevronDown aria-hidden />
      </button>
      <IconButton label={t("studio.app.sceneOptions")} icon={<Ellipsis aria-hidden />} onClick={() => void options()} />
      {error && (
        <p className="msg-warn" role="alert">
          {error}
        </p>
      )}
      {renaming && (
        <Dialog
          title={t("studio.app.rename")}
          onClose={() => setRenaming(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRenaming(null)}>
                {t("studio.app.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  void window.studio.invoke("scene.rename", renaming.id, renaming.name.trim());
                  setRenaming(null);
                }}
              >
                {t("studio.app.save")}
              </Button>
            </>
          }
        >
          <Field label={t("studio.app.sceneName")}>{(id) => <input id={id} className="input" maxLength={80} value={renaming.name} autoFocus onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />}</Field>
        </Dialog>
      )}
    </div>
  );
}
