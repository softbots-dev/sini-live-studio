import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { pickLocale, translator } from "../i18n";
import { setNumberLocale, type Settings, type WidgetProps } from "./types";
import { AlertWidget } from "./Alert";
import { GoalWidget } from "./Goal";
import { CounterWidget } from "./Counter";
import { CountdownWidget } from "./Countdown";
import { RankingWidget } from "./Ranking";
import { ChatboxWidget } from "./Chatbox";
import "./widget.css";

/*
  Halaman widget di layar siaran: dibuka mesin OBS sebagai sumber browser dari server widget lokal
  (`widget.html?id=<sumber>&type=<jenis>`). Semua keadaan datang dari aliran event `events?id=` — halaman ini
  tidak menyimpan apa pun dan tidak memanggil Sini.
*/
const params = new URLSearchParams(location.search);
const sourceId = params.get("id") ?? "";

const VIEWS: Record<string, (p: WidgetProps) => React.ReactNode> = {
  alert: AlertWidget,
  goal: GoalWidget,
  counter: CounterWidget,
  countdown: CountdownWidget,
  ranking: RankingWidget,
  chatbox: ChatboxWidget,
};

function Widget() {
  const [config, setConfig] = useState<{ type: string; settings: Settings; locale: string } | null>(null);
  const handlers = useRef(new Map<string, Set<(data: any) => void>>());
  const pending = useRef<[string, unknown][]>([]);

  useEffect(() => {
    const es = new EventSource(`events?id=${encodeURIComponent(sourceId)}`);
    const deliver = (event: string, data: unknown) => {
      const set = handlers.current.get(event);
      if (set?.size) set.forEach((fn) => fn(data));
      else pending.current.push([event, data]);
    };
    es.addEventListener("config", (e) => setConfig(JSON.parse((e as MessageEvent).data)));
    for (const event of ["alert.show", "alert.update", "alert.hide", "goal", "counter", "countdown", "ranking", "chat"]) es.addEventListener(event, (e) => deliver(event, JSON.parse((e as MessageEvent).data)));
    return () => es.close();
  }, []);

  const on = useCallback<WidgetProps["on"]>((event, fn) => {
    // Dipanggil di efek komponen; event yang datang sebelum komponennya terpasang diputar ulang di sini.
    if (!handlers.current.has(event)) handlers.current.set(event, new Set());
    handlers.current.get(event)!.add(fn as (data: any) => void);
    const queued = pending.current.filter(([e]) => e === event);
    pending.current = pending.current.filter(([e]) => e !== event);
    for (const [, data] of queued) fn(data as never);
    return () => {
      handlers.current.get(event)?.delete(fn as (data: any) => void);
    };
  }, []);

  const t = useMemo(() => {
    const locale = pickLocale(config?.locale ?? navigator.language);
    setNumberLocale(locale);
    return translator(locale);
  }, [config?.locale]);
  useEffect(() => {
    if (config) document.documentElement.lang = pickLocale(config.locale);
  }, [config?.locale]);
  if (!config) return null;
  const View = VIEWS[config.type];
  return View ? <View key={config.type} t={t} settings={config.settings} on={on} /> : null;
}

// Tanpa StrictMode: efek ganda di mode pengembangan akan memakan event snapshot yang diputar ulang.
createRoot(document.getElementById("root")!).render(<Widget />);
