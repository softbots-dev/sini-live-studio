import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Languages } from "lucide-react";
import { useT } from "../i18n";
import { Button, IconButton } from "../ui";
import { TitleBar } from "../TitleBar";
import { SiniMark, openLanguageMenu, rich } from "../brand";

type Phase = { kind: "idle" } | { kind: "waiting"; code: string | null } | { kind: "expired" } | { kind: "failed" };

/*
  Layar sambutan (belum masuk) + kode sambungan. Masuk lewat browser ("masuk ke TV"): kode tampil di sini dan
  di halaman sini.live yang terbuka (docs/live-studio.md). Lengkung & bulatan = CSS, bukan gambar.
*/
export function WelcomeScreen() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [version, setVersion] = useState("");

  useEffect(() => window.studio.on<string>("link.code", (code) => setPhase({ kind: "waiting", code })), []);
  useEffect(() => {
    void window.studio.invoke<{ version: string }>("app.info").then((i) => setVersion(i.version));
  }, []);

  const start = async () => {
    setPhase({ kind: "waiting", code: null });
    const result = await window.studio.invoke<string>("link.start");
    if (result === "linked" || result === "cancelled") setPhase({ kind: "idle" });
    else if (result === "expired") setPhase({ kind: "expired" });
    else setPhase({ kind: "failed" });
  };
  const legalLink = (path: string, label: string) => (
    <button type="button" className="link-inline" onClick={() => void window.studio.invoke("open.web", path)}>
      {label}
    </button>
  );

  return (
    <div className="welcome-shell">
      <TitleBar right={<IconButton label={t("studio.app.language")} icon={<Languages aria-hidden />} onClick={() => void openLanguageMenu(t)} />} />
      <main className="welcome">
        <span className="welcome-arc" aria-hidden />
        <span className="welcome-orb" aria-hidden />
        {phase.kind === "waiting" ? (
          <section className="welcome-card" aria-live="polite">
            <SiniMark size={40} />
            <h1>{t("studio.app.link.title")}</h1>
            <p className="muted">{t("studio.app.link.waiting")}</p>
            <div className="code-box">
              <span className="code-label">{t("studio.app.link.codeLabel")}</span>
              <span className="code-value">{phase.code ?? "····-····"}</span>
            </div>
            <p className="hint">{t("studio.app.link.codeHint")}</p>
            <Button variant="ghost" icon={<ArrowLeft aria-hidden />} onClick={() => void window.studio.invoke("link.cancel")}>
              {t("studio.app.cancel")}
            </Button>
          </section>
        ) : (
          <section className="welcome-hero">
            <div className="welcome-brand">
              <SiniMark size={32} />
              <span className="welcome-word">Sini</span>
              <span className="welcome-tag">Live Studio</span>
            </div>
            <h1>{t("studio.app.welcome.title")}</h1>
            <p>{t("studio.app.welcome.body")}</p>
            {phase.kind === "expired" && <p className="msg-warn" role="alert">{t("studio.app.link.expired")}</p>}
            {phase.kind === "failed" && <p className="msg-error" role="alert">{t("studio.app.link.failed")}</p>}
            <Button variant="primary" size="lg" className="welcome-cta" icon={<ExternalLink aria-hidden />} onClick={() => void start()}>
              {t("studio.app.link.button")}
            </Button>
          </section>
        )}
        <footer className="welcome-legal">
          <p>{rich(t("studio.app.welcome.legal"), { terms: legalLink("/p/terms-of-service/", t("studio.app.terms")), privacy: legalLink("/p/privacy-policy/", t("studio.app.privacy")) })}</p>
          {version && <p>{t("studio.app.version", { version })}</p>}
        </footer>
      </main>
    </div>
  );
}
