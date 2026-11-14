import { useEffect, useState } from "react";
import { ExternalLink, MonitorPlay } from "lucide-react";
import { useT } from "../i18n";
import { Button } from "../ui";

type Phase = { kind: "idle" } | { kind: "waiting"; code: string | null } | { kind: "expired" } | { kind: "failed" };

/** Masuk lewat browser ("masuk ke TV"): kode tampil di sini dan di halaman sini.live yang terbuka. */
export function LinkScreen() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => window.studio.on<string>("link.code", (code) => setPhase({ kind: "waiting", code })), []);

  const start = async () => {
    setPhase({ kind: "waiting", code: null });
    const result = await window.studio.invoke<string>("link.start");
    if (result === "linked" || result === "cancelled") setPhase({ kind: "idle" });
    else if (result === "expired") setPhase({ kind: "expired" });
    else setPhase({ kind: "failed" });
  };

  return (
    <main className="splash">
      <span className="splash-icon">
        <MonitorPlay aria-hidden />
      </span>
      <h1>{t("studio.app.link.title")}</h1>
      {phase.kind === "waiting" ? (
        <div className="link-wait" aria-live="polite">
          <p className="muted narrow">{t("studio.app.link.waiting")}</p>
          <div className="code-box">
            <span className="code-label">{t("studio.app.link.codeLabel")}</span>
            <span className="code-value">{phase.code ?? "····-····"}</span>
          </div>
          <p className="hint narrow">{t("studio.app.link.codeHint")}</p>
          <Button variant="ghost" onClick={() => void window.studio.invoke("link.cancel")}>
            {t("studio.app.cancel")}
          </Button>
        </div>
      ) : (
        <>
          <p className="muted narrow">{t("studio.app.link.body")}</p>
          {phase.kind === "expired" && <p className="msg-warn" role="alert">{t("studio.app.link.expired")}</p>}
          {phase.kind === "failed" && <p className="msg-error" role="alert">{t("studio.app.link.failed")}</p>}
          <Button variant="primary" size="lg" icon={<ExternalLink aria-hidden />} onClick={() => void start()}>
            {t("studio.app.link.button")}
          </Button>
        </>
      )}
    </main>
  );
}
