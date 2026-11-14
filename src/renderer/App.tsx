import { MonitorPlay } from "lucide-react";
import { useT } from "./i18n";

export function App() {
  const { t } = useT();
  return (
    <main className="splash">
      <span className="splash-icon">
        <MonitorPlay aria-hidden />
      </span>
      <h1>{t("studio.app.name")}</h1>
      <p className="muted">{t("studio.app.loading")}</p>
    </main>
  );
}
