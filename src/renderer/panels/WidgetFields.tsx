import { useEffect, useState } from "react";
import { Minus, Pause, Play, Plus, RotateCcw, Send } from "lucide-react";
import type { Source } from "../screens/Studio";
import { useT } from "../i18n";
import { Button, Field } from "../ui";

type Patch = Record<string, unknown>;
const GOALS = ["coins", "gifts", "followers", "members"] as const;
const FONTS = ["small", "medium", "large"] as const;
const clamp = (v: string, min: number, max: number, fallback: number) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/*
  Pengaturan widget di dialog Properti sumber (batasnya ditegakkan lagi di proses utama, widgets/config.mjs).
  Tombol Uji mengirim contoh ke widget ini saja; penghitung & hitung mundur punya kontrol langsung.
*/
export function WidgetFields({ source, settings, onCommit }: { source: Source; settings: Patch; onCommit: (patch: Patch) => void }) {
  const { t } = useT();
  const type = String(settings.widget ?? "");
  const hasTitle = ["goal", "counter", "countdown", "ranking"].includes(type);
  return (
    <>
      {hasTitle && <TitleField key={source.id} value={String(settings.title ?? "")} onCommit={(title) => onCommit({ title })} />}

      {type === "alert" && (
        <>
          <div className="row">
            <Field label={t("studio.app.widget.duration")}>
              {(id) => <input id={id} className="input" type="number" min={3} max={15} value={Number(settings.durationSec ?? 5)} onChange={(e) => onCommit({ durationSec: clamp(e.target.value, 3, 15, 5) })} />}
            </Field>
            <Field label={t("studio.app.widget.minCoins")}>
              {(id) => <input id={id} className="input" type="number" min={1} value={Number(settings.minCoins ?? 1)} onChange={(e) => onCommit({ minCoins: clamp(e.target.value, 1, 1e9, 1) })} />}
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.sound !== false} onChange={(e) => onCommit({ sound: e.target.checked })} />
            {t("studio.app.widget.sound")}
          </label>
          <p className="hint">{t("studio.app.widget.soundHint")}</p>
        </>
      )}

      {type === "goal" && (
        <>
          <div className="row">
            <Field label={t("studio.app.widget.goalType")}>
              {(id) => (
                <select id={id} className="input" value={String(settings.goal ?? "coins")} onChange={(e) => onCommit({ goal: e.target.value })}>
                  {GOALS.map((g) => (
                    <option key={g} value={g}>
                      {t(`studio.app.widget.goal.${g}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("studio.app.widget.target")}>
              {(id) => <input id={id} className="input" type="number" min={1} value={Number(settings.target ?? 100)} onChange={(e) => onCommit({ target: clamp(e.target.value, 1, 1e12, 100) })} />}
            </Field>
          </div>
          <p className="hint">{t("studio.app.widget.goalHint")}</p>
        </>
      )}

      {type === "counter" && <CounterControls sourceId={source.id} value={Number(source.settings.value ?? 0)} />}

      {type === "countdown" && <CountdownFields sourceId={source.id} durationSec={Number(settings.durationSec ?? 300)} onCommit={onCommit} />}

      {type === "ranking" && (
        <Field label={t("studio.app.widget.rows")}>
          {(id) => <input id={id} className="input" type="number" min={3} max={10} value={Number(settings.rows ?? 5)} onChange={(e) => onCommit({ rows: clamp(e.target.value, 3, 10, 5) })} />}
        </Field>
      )}

      {type === "chatbox" && (
        <>
          <div className="row">
            <Field label={t("studio.app.widget.fontSize")}>
              {(id) => (
                <select id={id} className="input" value={String(settings.fontSize ?? "medium")} onChange={(e) => onCommit({ fontSize: e.target.value })}>
                  {FONTS.map((f) => (
                    <option key={f} value={f}>
                      {t(`studio.app.widget.font.${f}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("studio.app.widget.rows")}>
              {(id) => <input id={id} className="input" type="number" min={3} max={15} value={Number(settings.rows ?? 8)} onChange={(e) => onCommit({ rows: clamp(e.target.value, 3, 15, 8) })} />}
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={settings.showEvents !== false} onChange={(e) => onCommit({ showEvents: e.target.checked })} />
            {t("studio.app.widget.showEvents")}
          </label>
        </>
      )}

      {(type === "alert" || type === "chatbox") && (
        <div className="field">
          <Button icon={<Send aria-hidden />} onClick={() => void window.studio.invoke("widget.test", source.id)}>
            {t("studio.app.widget.test")}
          </Button>
          <p className="hint">{t("studio.app.widget.testHint")}</p>
        </div>
      )}
    </>
  );
}

/** Judul disimpan saat isian ditinggalkan / Enter — bukan tiap ketikan. */
function TitleField({ value, onCommit }: { value: string; onCommit: (title: string) => void }) {
  const { t } = useT();
  const [title, setTitle] = useState(value);
  const commit = () => title !== value && onCommit(title.slice(0, 60));
  return (
    <Field label={t("studio.app.widget.title")} hint={t("studio.app.widget.titleHint")}>
      {(id) => <input id={id} className="input" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />}
    </Field>
  );
}

function CounterControls({ sourceId, value }: { sourceId: string; value: number }) {
  const { t } = useT();
  const run = (op: "inc" | "dec" | "reset") => void window.studio.invoke("widget.counter", sourceId, op);
  return (
    <div className="field">
      <span className="field-label">{t("studio.app.widget.value")}</span>
      <div className="widget-controls">
        <Button icon={<Minus aria-hidden />} onClick={() => run("dec")}>
          {t("studio.app.widget.dec")}
        </Button>
        <span className="widget-value" aria-live="polite">
          {value}
        </span>
        <Button icon={<Plus aria-hidden />} onClick={() => run("inc")}>
          {t("studio.app.widget.inc")}
        </Button>
        <Button variant="ghost" icon={<RotateCcw aria-hidden />} onClick={() => run("reset")}>
          {t("studio.app.widget.reset")}
        </Button>
      </div>
    </div>
  );
}

function CountdownFields({ sourceId, durationSec, onCommit }: { sourceId: string; durationSec: number; onCommit: (patch: Patch) => void }) {
  const { t } = useT();
  const [running, setRunning] = useState(false);
  useEffect(() => {
    void window.studio.invoke<{ running: boolean } | null>("widget.countdownState", sourceId).then((s) => setRunning(Boolean(s?.running)));
  }, [sourceId]);
  const h = Math.floor(durationSec / 3600);
  const m = Math.floor((durationSec % 3600) / 60);
  const s = durationSec % 60;
  const commit = (hh: number, mm: number, ss: number) => onCommit({ durationSec: Math.min(86400, Math.max(1, hh * 3600 + mm * 60 + ss)) });
  const run = async (op: "toggle" | "reset") => {
    const state = await window.studio.invoke<{ running: boolean } | null>("widget.countdown", sourceId, op);
    setRunning(Boolean(state?.running));
  };
  return (
    <>
      <div className="row">
        <Field label={t("studio.app.widget.hours")}>{(id) => <input id={id} className="input" type="number" min={0} max={24} value={h} onChange={(e) => commit(clamp(e.target.value, 0, 24, 0), m, s)} />}</Field>
        <Field label={t("studio.app.widget.minutes")}>{(id) => <input id={id} className="input" type="number" min={0} max={59} value={m} onChange={(e) => commit(h, clamp(e.target.value, 0, 59, 0), s)} />}</Field>
        <Field label={t("studio.app.widget.seconds")}>{(id) => <input id={id} className="input" type="number" min={0} max={59} value={s} onChange={(e) => commit(h, m, clamp(e.target.value, 0, 59, 0))} />}</Field>
      </div>
      <div className="widget-controls">
        <Button variant="primary" icon={running ? <Pause aria-hidden /> : <Play aria-hidden />} onClick={() => void run("toggle")}>
          {t(running ? "studio.app.widget.pause" : "studio.app.widget.start")}
        </Button>
        <Button variant="ghost" icon={<RotateCcw aria-hidden />} onClick={() => void run("reset")}>
          {t("studio.app.widget.reset")}
        </Button>
      </div>
    </>
  );
}
