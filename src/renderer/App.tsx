import { MonitorPlay, TriangleAlert } from "lucide-react";
import { useT } from "./i18n";
import { useMainState } from "./store";
import { LinkScreen } from "./screens/Link";
import { StudioScreen } from "./screens/Studio";

export type User = { id: string; username: string; displayName: string; avatarUrl: string | null; roles: string[] };
type Account = { status: "loading" | "signedOut" | "signedIn"; user: User | null };
type Engine = { ready: boolean; error: string | null };

export function App() {
  const { t } = useT();
  const account = useMainState<Account>("account", "account.get", { status: "loading", user: null });
  const engine = useMainState<Engine>("engine", "engine.get", { ready: false, error: null });

  if (account.status === "signedOut") return <LinkScreen />;
  if (engine.error)
    return (
      <main className="splash" role="alert">
        <span className="splash-icon splash-icon-warn">
          <TriangleAlert aria-hidden />
        </span>
        <h1>{t("studio.app.engineFailed")}</h1>
        <p className="muted narrow">{t("studio.app.engineFailedHint")}</p>
      </main>
    );
  if (account.status === "loading" || !engine.ready || !account.user)
    return (
      <main className="splash" aria-busy="true">
        <span className="splash-icon">
          <MonitorPlay aria-hidden />
        </span>
        <h1>{t("studio.app.name")}</h1>
        <p className="muted">{account.status === "loading" ? t("studio.app.loading") : t("studio.app.engineStarting")}</p>
      </main>
    );
  return <StudioScreen user={account.user} />;
}
