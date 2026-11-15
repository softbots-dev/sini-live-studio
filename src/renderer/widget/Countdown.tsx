import { useEffect, useState } from "react";
import { titleOf, type CountdownState, type WidgetProps } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
export function clockText(ms: number) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/* Hitung mundur: jam di proses utama; detik dihitung di sini dari `remainingMs` + waktu terima. */
export function CountdownWidget({ t, settings, on }: WidgetProps) {
  const [state, setState] = useState<{ running: boolean; remainingMs: number; receivedAt: number }>({ running: false, remainingMs: (Number(settings.durationSec) || 0) * 1000, receivedAt: Date.now() });
  const [, tick] = useState(0);
  useEffect(() => on<CountdownState>("countdown", (d) => setState({ running: d.running, remainingMs: d.remainingMs, receivedAt: Date.now() })), [on]);
  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [state.running]);
  const left = state.running ? state.remainingMs - (Date.now() - state.receivedAt) : state.remainingMs;
  return (
    <div className="w-card w-big">
      <span className="w-title">{titleOf(settings, t, "studio.app.wp.countdownTitle")}</span>
      <span className={`w-big-num ${left <= 0 ? "is-done" : ""}`}>{clockText(left)}</span>
    </div>
  );
}
