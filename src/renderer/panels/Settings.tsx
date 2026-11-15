import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { Button, Dialog, Field } from "../ui";
import { LOCALE_NAMES } from "../brand";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [data, setData] = useState<{ encoder: string | null; encoders: string[]; locale: string | null } | null>(null);
  const [version, setVersion] = useState("");
  useEffect(() => {
    void window.studio.invoke<{ encoder: string | null; encoders: string[]; locale: string | null }>("settings.get").then(setData);
    void window.studio.invoke<{ version: string }>("app.info").then((i) => setVersion(i.version));
  }, []);
  const h264 = (data?.encoders ?? []).filter((e) => /x264|nvenc_h264|jim_nvenc$|amf_h264|texture_amf|qsv11(_v2)?$/.test(e));

  return (
    <Dialog title={t("studio.app.settingsTitle")} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>{t("studio.app.done")}</Button>}>
      <Field label={t("studio.app.encoderLabel")} hint={t("studio.app.encoderHint")}>
        {(id) => (
          <select
            id={id}
            className="input"
            value={data?.encoder ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              setData((d) => (d ? { ...d, encoder: v } : d));
              void window.studio.invoke("settings.setEncoder", v);
            }}
          >
            <option value="">{t("studio.app.encoderAuto")}</option>
            {h264.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t("studio.app.language")}>
        {(id) => (
          <select
            id={id}
            className="input"
            value={data?.locale ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              setData((d) => (d ? { ...d, locale: v } : d));
              void window.studio.invoke("settings.setLocale", v);
            }}
          >
            <option value="">{t("studio.app.languageSystem")}</option>
            {LOCALE_NAMES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <p className="hint">{t("studio.app.version", { version })}</p>
    </Dialog>
  );
}
