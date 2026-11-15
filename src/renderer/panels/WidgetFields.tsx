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
  const available = useWidgetsAvailable();
  return (
    <>
      {!available && (
        <p className="msg-warn" role="alert">
          {t("studio.app.widget.unavailable")}
        </p>
      )}
      {hasTitle && <TitleField key={source.id} value={String(settings.title ?? "")} onCommit={(title) => onCommit({ title })} />}

      {type === "alert" && (
        <>
          <div className="row">
            <Field label={t("studio.app.widget.duration")}>
              {(id) => <NumberField id={id} min={3} max={15} value={Number(settings.durationSec ?? 5)} onCommit={(v) => onCommit({ durationSec: v })} />}
            </Field>
            <Field label={t("studio.app.widget.minCoins")}>
              {(id) => <NumberField id={id} min={1} max={1e9} value={Number(settings.minCoins ?? 1)} onCommit={(v) => onCommit({ minCoins: v })} />}
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
              {(id) => <NumberField id={id} min={1} max={1e12} value={Number(settings.target ?? 100)} onCommit={(v) => onCommit({ target: v })} />}
            </Field>
          </div>
          <p className="hint">{t("studio.app.widget.goalHint")}</p>
        </>
      )}

      {type === "counter" && <CounterControls sourceId={source.id} value={Number(source.settings.value ?? 0)} />}

      {type === "countdown" && <CountdownFields sourceId={source.id} durationSec={Number(settings.durationSec ?? 300)} onCommit={onCommit} />}

      {type === "ranking" && (
        <Field label={t("studio.app.widget.rows")}>
          {(id) => <NumberField id={id} min={3} max={10} value={Number(settings.rows ?? 5)} onCommit={(v) => onCommit({ rows: v })} />}
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
              {(id) => <NumberField id={id} min={3} max={15} value={Number(settings.rows ?? 8)} onCommit={(v) => onCommit({ rows: v })} />}
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

/** false kalau server widget lokal gagal menyala (widget tampil kosong sampai studio dibuka ulang). */
export function useWidgetsAvailable() {
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    let alive = true;
    void window.studio.invoke<boolean>("widget.available").then((ok) => alive && setAvailable(ok !== false));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

/**
 * Angka disimpan (dan dijepit ke batasnya) saat isian ditinggalkan / Enter — bukan tiap ketukan, supaya
 * mengetik "12" tidak dijepit dulu di "1". Tombol panah naik/turun tetap langsung tersimpan.
 */
function NumberField({ id, value, min, max, onCommit }: { id: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const v = clamp(raw, min, max, value);
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      id={id}
      className="input"
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        // Panah naik/turun (bukan ketikan) langsung tersimpan.
        if (!(e.nativeEvent as InputEvent).inputType) commit(e.target.value);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
    />
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
    // Jam habis saat dialog terbuka → tombol kembali "Mulai".
    return window.studio.on<{ id: string; state: { running: boolean } }>("widget.countdown", (e) => e.id === sourceId && setRunning(Boolean(e.state?.running)));
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
        <Field label={t("studio.app.widget.hours")}>{(id) => <NumberField id={id} min={0} max={24} value={h} onCommit={(v) => commit(v, m, s)} />}</Field>
        <Field label={t("studio.app.widget.minutes")}>{(id) => <NumberField id={id} min={0} max={59} value={m} onCommit={(v) => commit(h, v, s)} />}</Field>
        <Field label={t("studio.app.widget.seconds")}>{(id) => <NumberField id={id} min={0} max={59} value={s} onCommit={(v) => commit(h, m, v)} />}</Field>
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
