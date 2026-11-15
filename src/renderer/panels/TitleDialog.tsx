import { useState } from "react";
import { useT } from "../i18n";
import { Button, Dialog, Field } from "../ui";

/** Judul & kategori siaran (dibuka dari tombol di tengah bilah judul). Tidak bisa diubah saat siaran. */
export function TitleDialog({ title, category, categories, live, onSave, onClose }: { title: string; category: string; categories: { slug: string; name: string }[]; live: boolean; onSave: (title: string, category: string) => void; onClose: () => void }) {
  const { t } = useT();
  const [draft, setDraft] = useState(title);
  const [cat, setCat] = useState(category);
  return (
    <Dialog
      title={t("studio.app.editTitle")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("studio.app.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={live}
            onClick={() => {
              onSave(draft.trim(), cat);
              onClose();
            }}
          >
            {t("studio.app.save")}
          </Button>
        </>
      }
    >
      {live && <p className="msg-warn">{t("studio.app.titleLocked")}</p>}
      <Field label={t("studio.app.titleLabel")}>
        {(id) => <input id={id} className="input" value={draft} maxLength={140} placeholder={t("studio.app.titlePlaceholder")} disabled={live} autoFocus onChange={(e) => setDraft(e.target.value)} />}
      </Field>
      <Field label={t("studio.app.categoryLabel")}>
        {(id) => (
          <select id={id} className="input" value={cat} disabled={live} onChange={(e) => setCat(e.target.value)}>
            <option value="">{t("studio.app.categoryNone")}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Dialog>
  );
}
