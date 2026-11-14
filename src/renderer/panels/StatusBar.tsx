import { useEffect, useState } from "react";
import { Radio, Square } from "lucide-react";
import { useT } from "../i18n";
import { useMainState } from "../store";
import { Button, Dialog } from "../ui";

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

function useDuration(since: string | null | undefined) {
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

export function StatusBar({ broadcast, title, category }: { broadcast: BroadcastState; title: string; category: string }) {
  const { t } = useT();
  const stats = useMainState<Stats | null>("stats", null, null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const duration = useDuration(broadcast.phase === "live" ? broadcast.liveSince : null);
  const active = ACTIVE.has(broadcast.phase);

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
    <footer className="statusbar">
      <div className="status-left" aria-live="polite">
        {active && (
          <span className={`badge ${broadcast.phase === "live" ? "badge-live" : "badge-wait"}`}>
            {broadcast.phase === "live" && <span className="dot" aria-hidden />}
            {t(`studio.app.phase.${broadcast.phase}`)}
          </span>
        )}
        {broadcast.phase === "checking" && <span className="muted">{t("studio.app.phase.checking")}</span>}
        {duration && <span className="tabular">{duration}</span>}
        {message && (
          <span className={`msg-${message.tone}`} role={message.tone === "error" ? "alert" : undefined}>
            {message.text}
          </span>
        )}
        {message?.action && (
          <Button size="sm" variant="ghost" onClick={message.action.run}>
            {message.action.label}
          </Button>
        )}
      </div>
      <div className="status-stats">
        {stats && active && (
          <>
            <span className="tabular">{t("studio.app.bitrate", { kbps: stats.kbps })}</span>
            <span className="tabular">{t("studio.app.dropped", { count: stats.droppedFrames })}</span>
            <span className="tabular">{t("studio.app.cpu", { cpu: stats.cpu })}</span>
            {stats.encoder && <span>{t("studio.app.encoderInUse", { name: stats.encoder })}</span>}
          </>
        )}
      </div>
      <div className="status-action">
        {active ? (
          <Button variant="danger" size="lg" icon={<Square aria-hidden />} onClick={() => setConfirmEnd(true)} disabled={broadcast.phase === "starting"}>
            {t("studio.app.end")}
          </Button>
        ) : (
          <Button variant="live" size="lg" icon={<Radio aria-hidden />} disabled={broadcast.phase !== "ready"} onClick={() => (broadcast.alreadyLive ? setConfirmLive(true) : start())}>
            {t("studio.app.start")}
          </Button>
        )}
      </div>

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
