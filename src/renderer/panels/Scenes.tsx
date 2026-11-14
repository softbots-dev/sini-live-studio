import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Collection } from "../screens/Studio";
import { useT } from "../i18n";
import type { Result } from "../store";
import { Button, Dialog, Field, IconButton } from "../ui";

export function ScenesPanel({ collection }: { collection: Collection | null }) {
  const { t } = useT();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!collection) return null;

  const label = (name: string, i: number) => name || t("studio.app.sceneDefault", { n: i + 1 });
  const run = async (channel: string, ...args: unknown[]) => {
    const r = await window.studio.invoke<Result>(channel, ...args);
    setError(r.ok ? null : r.code === "last_scene" ? t("studio.app.lastScene") : null);
  };

  return (
    <section className="panel" aria-labelledby="scenes-title">
      <header className="panel-head">
        <h2 id="scenes-title">{t("studio.app.scenes")}</h2>
        <IconButton label={t("studio.app.addScene")} icon={<Plus aria-hidden />} onClick={() => void run("scene.add", t("studio.app.sceneDefault", { n: collection.scenes.length + 1 }))} />
      </header>
      <ul className="list" role="listbox" aria-labelledby="scenes-title">
        {collection.scenes.map((s, i) => (
          <li key={s.id} className={`list-row ${s.id === collection.activeSceneId ? "is-active" : ""}`}>
            <button type="button" role="option" aria-selected={s.id === collection.activeSceneId} className="list-main" onClick={() => void run("scene.activate", s.id)}>
              {label(s.name, i)}
            </button>
            <IconButton label={t("studio.app.rename")} icon={<Pencil aria-hidden />} onClick={() => setRenaming({ id: s.id, name: label(s.name, i) })} />
            <IconButton label={t("studio.app.delete")} icon={<Trash2 aria-hidden />} onClick={() => void run("scene.remove", s.id)} disabled={collection.scenes.length <= 1} />
          </li>
        ))}
      </ul>
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
                  void run("scene.rename", renaming.id, renaming.name.trim());
                  setRenaming(null);
                }}
              >
                {t("studio.app.save")}
              </Button>
            </>
          }
        >
          <Field label={t("studio.app.sceneName")}>{(id) => <input id={id} className="input" maxLength={80} value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />}</Field>
        </Dialog>
      )}
    </section>
  );
}
