import { MonitorPlay, TriangleAlert } from "lucide-react";
import { useT } from "./i18n";
import { useMainState } from "./store";
import { WelcomeScreen } from "./screens/Welcome";
import { TitleBar } from "./TitleBar";
import { StudioScreen } from "./screens/Studio";

export type User = { id: string; username: string; displayName: string; avatarUrl: string | null; roles: string[] };
type Account = { status: "loading" | "signedOut" | "signedIn"; user: User | null };
type Engine = { ready: boolean; error: string | null };

export function App() {
  const { t } = useT();
  const account = useMainState<Account>("account", "account.get", { status: "loading", user: null });
  const engine = useMainState<Engine>("engine", "engine.get", { ready: false, error: null });

  if (account.status === "signedOut") return <WelcomeScreen />;
  if (engine.error)
    return (
      <div className="app-shell">
      <TitleBar />
      <main className="splash" role="alert">
        <span className="splash-icon splash-icon-warn">
          <TriangleAlert aria-hidden />
        </span>
        <h1>{t("studio.app.engineFailed")}</h1>
        <p className="muted narrow">{t("studio.app.engineFailedHint")}</p>
      </main>
      </div>
    );
  if (account.status === "loading" || !engine.ready || !account.user)
    return (
      <div className="app-shell">
      <TitleBar />
      <main className="splash" aria-busy="true">
        <span className="splash-icon">
          <MonitorPlay aria-hidden />
        </span>
        <h1>{t("studio.app.name")}</h1>
        <p className="muted">{account.status === "loading" ? t("studio.app.loading") : t("studio.app.engineStarting")}</p>
      </main>
      </div>
    );
  return <StudioScreen user={account.user} />;
}
