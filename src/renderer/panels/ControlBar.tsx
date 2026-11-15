import { useEffect, useState } from "react";
import { AudioLines, Layers, Mic, MicOff, Plus, Radio, Square, Volume2, VolumeX } from "lucide-react";
import type { Collection, Scene } from "../screens/Studio";
import { useT } from "../i18n";
import { sourceDialogStore, useMainState } from "../store";
import { Button, Dialog, IconButton } from "../ui";
import { MixerPanel, meter } from "./Mixer";
import { openSceneMenu } from "./Scenes";
import { SOURCE_DEFAULTS } from "../kinds";

export type BroadcastState = {
  phase: "idle" | "checking" | "ready" | "blocked" | "starting" | "connecting" | "live" | "reconnecting" | "ended" | "failed";
  reason?: string;
  code?: string;
  retryAfterMs?: number | null;
  alreadyLive?: boolean;
  slowStart?: boolean;
  liveSince?: string | null;
  channel?: { id: string; slug: string | null; title: string | null; categorySlug: string | null; isLive: boolean } | null;
};
type Stats = { kbps: number; droppedFrames: number; totalFrames: number; cpu: number; fps: number; encoder: string | null };

const ACTIVE = new Set(["starting", "connecting", "live", "reconnecting"]);
const FAILED = new Set(["rate_limited", "reconnect_exhausted", "output_failed", "network"]);

export function useDuration(since: string | null | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return null;
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/*
  Slider cepat untuk sumber audio PERTAMA berjenis `kind` di scene aktif (audio komputer / mikrofon), dengan
  meter level di dalam trek; klik ikon = bisu. Tanpa sumber itu: tombol kecil untuk menambahkannya langsung.
*/
function QuickAudio({ kind, collection, scene, levels }: { kind: "wasapi_output_capture" | "wasapi_input_capture"; collection: Collection; scene: Scene; levels: Record<string, number[]> }) {
  const { t } = useT();
  const used = new Set(scene.items.map((i) => i.sourceId));
  const src = collection.sources.find((s) => s.kind === kind && used.has(s.id));
  const mic = kind === "wasapi_input_capture";
  if (!src) {
    return (
      <Button size="sm" variant="ghost" icon={mic ? <Mic aria-hidden /> : <Volume2 aria-hidden />} onClick={() => void window.studio.invoke("source.add", kind, t(`studio.app.kind.${kind}`), SOURCE_DEFAULTS[kind] ?? {})}>
        {mic ? t("studio.app.addMic") : t("studio.app.addDesktopAudio")}
      </Button>
    );
  }
  const peak = Math.max(...(levels[src.id] ?? [-Infinity]));
  const level = src.muted ? 0 : meter(peak);
  const icon = mic ? src.muted ? <MicOff aria-hidden /> : <Mic aria-hidden /> : src.muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />;
  return (
    <div className="quick-audio">
      <IconButton label={src.muted ? t("studio.app.unmute", { name: src.name }) : t("studio.app.mute", { name: src.name })} pressed={src.muted} icon={icon} onClick={() => void window.studio.invoke("audio.mute", src.id, !src.muted)} />
      <div className="quick-track">
        <span className="quick-level" style={{ width: `${level}%` }} aria-hidden />
        <input type="range" min={0} max={1} step={0.01} value={src.volume} aria-label={t("studio.app.volume", { name: src.name })} onChange={(e) => void window.studio.invoke("audio.volume", src.id, Number(e.target.value))} />
      </div>
    </div>
  );
}

/*
  Bilah kontrol di bawah pratinjau: tambah sumber, pindah scene, audio komputer & mikrofon, mixer lengkap,
  Go Live / Akhiri (dengan konfirmasi), pesan kesiapan/galat di atasnya, statistik siaran di bawahnya.
*/
export function ControlBar({ broadcast, title, category, collection, scene }: { broadcast: BroadcastState; title: string; category: string; collection: Collection | null; scene: Scene | null }) {
  const { t, locale } = useT();
  const stats = useMainState<Stats | null>("stats", null, null);
  const levels = useMainState<Record<string, number[]>>("volmeter", null, {});
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const duration = useDuration(broadcast.phase === "live" ? broadcast.liveSince : null);
  const active = ACTIVE.has(broadcast.phase);
  const nf = new Intl.NumberFormat(locale);
  const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  const start = () => {
    setConfirmLive(false);
    void window.studio.invoke("broadcast.start", { title: title.trim() || undefined, categorySlug: category || null });
  };

  let message: { tone: "warn" | "error" | "info"; text: string; action?: { label: string; run: () => void } } | null = null;
  if (broadcast.phase === "blocked" && broadcast.reason) {
    const action =
      broadcast.reason === "not_streamer"
        ? { label: t("studio.app.becomeStreamer"), run: () => void window.studio.invoke("open.web", "/become-streamer/") }
        : broadcast.reason === "signed_out"
          ? undefined
          : { label: t("studio.app.checkAgain"), run: () => void window.studio.invoke("broadcast.check") };
    message = { tone: "warn", text: t(`studio.app.blocked.${broadcast.reason}`), action };
  } else if (broadcast.phase === "failed") {
    message = { tone: "error", text: t(`studio.app.failed.${FAILED.has(broadcast.code ?? "") ? broadcast.code : "generic"}`), action: { label: t("studio.app.retry"), run: () => void window.studio.invoke("broadcast.check") } };
  } else if (broadcast.phase === "ended" && broadcast.reason) {
    message = { tone: broadcast.reason === "user" ? "info" : "warn", text: t(`studio.app.ended.${broadcast.reason}`), action: { label: t("studio.app.checkAgain"), run: () => void window.studio.invoke("broadcast.check") } };
  } else if (broadcast.phase === "connecting" && broadcast.slowStart) {
    message = { tone: "info", text: t("studio.app.slowStart") };
  }

  return (
    <footer className="ctrl-wrap">
      {message && (
        <div className={`ctrl-msg ctrl-msg-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          <span>{message.text}</span>
          {message.action && (
            <Button size="sm" variant="ghost" onClick={message.action.run}>
              {message.action.label}
            </Button>
          )}
        </div>
      )}
      <div className="ctrl">
        <IconButton label={t("studio.app.addSource")} icon={<Plus aria-hidden />} onClick={() => sourceDialogStore.open({ type: "add" })} />
        <IconButton label={t("studio.app.chooseScene")} icon={<Layers aria-hidden />} disabled={!collection} onClick={() => collection && void openSceneMenu(t, collection)} />
        <span className="vsep" aria-hidden />
        {collection && scene && (
          <>
            <QuickAudio kind="wasapi_output_capture" collection={collection} scene={scene} levels={levels} />
            <QuickAudio kind="wasapi_input_capture" collection={collection} scene={scene} levels={levels} />
          </>
        )}
        <IconButton label={t("studio.app.mixer")} icon={<AudioLines aria-hidden />} disabled={!collection} onClick={() => setMixerOpen(true)} />
        <div className="ctrl-live" aria-live="polite">
          {active && (
            <span className={`badge ${broadcast.phase === "live" ? "badge-live" : "badge-wait"}`}>
              {broadcast.phase === "live" && <span className="dot" aria-hidden />}
              {t(`studio.app.phase.${broadcast.phase}`)}
            </span>
          )}
          {broadcast.phase === "checking" && <span className="muted">{t("studio.app.phase.checking")}</span>}
          {duration && <span className="tabular">{duration}</span>}
          {active ? (
            <Button variant="danger" icon={<Square aria-hidden />} onClick={() => setConfirmEnd(true)} disabled={broadcast.phase === "starting"}>
              {t("studio.app.end")}
            </Button>
          ) : (
            <Button variant="live" className="golive" icon={<Radio aria-hidden />} disabled={broadcast.phase !== "ready"} onClick={() => (broadcast.alreadyLive ? setConfirmLive(true) : start())}>
              {t("studio.app.start")}
            </Button>
          )}
        </div>
      </div>
      <div className="stats-row tabular">
        {stats && active ? (
          <>
            <span>{t("studio.app.cpu", { cpu: stats.cpu })}</span>
            <span>{t("studio.app.upload", { kbps: nf.format(stats.kbps) })}</span>
            <span>{t("studio.app.dropRate", { count: nf.format(stats.droppedFrames), pct: pct.format(stats.totalFrames > 0 ? (stats.droppedFrames / stats.totalFrames) * 100 : 0) })}</span>
            <span>{t("studio.app.fps", { fps: Math.round(stats.fps) })}</span>
            {stats.encoder && <span>{t("studio.app.encoderInUse", { name: stats.encoder })}</span>}
          </>
        ) : null}
      </div>

      {mixerOpen && (
        <Dialog
          title={t("studio.app.mixer")}
          onClose={() => setMixerOpen(false)}
          wide
          footer={
            <Button variant="primary" onClick={() => setMixerOpen(false)}>
              {t("studio.app.done")}
            </Button>
          }
        >
          <MixerPanel collection={collection} scene={scene} embedded />
        </Dialog>
      )}
      {confirmEnd && (
        <Dialog
          title={t("studio.app.endTitle")}
          onClose={() => setConfirmEnd(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
                {t("studio.app.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmEnd(false);
                  void window.studio.invoke("broadcast.end");
                }}
              >
                {t("studio.app.endConfirm")}
              </Button>
            </>
          }
        >
          <p>{t("studio.app.endBody")}</p>
        </Dialog>
      )}
      {confirmLive && (
        <Dialog
          title={t("studio.app.alreadyLiveTitle")}
          onClose={() => setConfirmLive(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmLive(false)}>
                {t("studio.app.cancel")}
              </Button>
              <Button variant="live" onClick={start}>
                {t("studio.app.continue")}
              </Button>
            </>
          }
        >
          <p>{t("studio.app.alreadyLiveBody")}</p>
        </Dialog>
      )}
    </footer>
  );
}
