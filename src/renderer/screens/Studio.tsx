import { useEffect, useState } from "react";
import { LogOut, MonitorPlay, Settings as SettingsIcon } from "lucide-react";
import type { User } from "../App";
import { useT } from "../i18n";
import { useMainState } from "../store";
import { Button, Dialog, Field, IconButton } from "../ui";
import { ScenesPanel } from "../panels/Scenes";
import { SourcesPanel } from "../panels/Sources";
import { PreviewPanel } from "../panels/Preview";
import { MixerPanel } from "../panels/Mixer";
import { StatusBar, type BroadcastState } from "../panels/StatusBar";
import { SettingsDialog } from "../panels/Settings";
import { ChatPanel } from "../panels/Chat";

export type Item = { id: string; sourceId: string; x: number; y: number; scaleX: number; scaleY: number; crop?: { left: number; right: number; top: number; bottom: number }; visible: boolean; locked: boolean };
export type Scene = { id: string; name: string; items: Item[] };
export type Source = { id: string; kind: string; name: string; settings: Record<string, unknown>; volume: number; muted: boolean; monitoring: string; filters: { kind: string; settings?: Record<string, unknown> }[] };
export type Collection = { orientation: "landscape" | "portrait"; activeSceneId: string; scenes: Scene[]; sources: Source[] };

export const ACTIVE_PHASES = new Set(["starting", "connecting", "live", "reconnecting"]);

export function StudioScreen({ user }: { user: User }) {
  const { t } = useT();
  const collection = useMainState<Collection | null>("scenes", "scenes.get", null);
  const broadcast = useMainState<BroadcastState>("broadcast", "broadcast.get", { phase: "idle" });
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("");
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [askQuit, setAskQuit] = useState(false);
  useEffect(() => window.studio.on("quit.ask", () => setAskQuit(true)), []);
  const live = ACTIVE_PHASES.has(broadcast.phase);

  useEffect(() => {
    void window.studio.invoke<{ slug: string; name: string }[]>("catalog.categories").then(setCategories);
  }, []);
  // Judul & kategori awal dari channel (sekali, saat kesiapan pertama kali datang).
  const channel = broadcast.channel;
  useEffect(() => {
    if (!channel) return;
    setTitle((prev) => prev || channel.title || "");
    setCategory((prev) => prev || channel.categorySlug || "");
  }, [channel]);

  const activeScene = collection?.scenes.find((s) => s.id === collection.activeSceneId) ?? null;

  const signOut = async () => {
    const r = await window.studio.invoke<{ ok: boolean }>("account.signOut");
    setSignOutError(!r.ok);
  };

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <MonitorPlay aria-hidden />
          <span>{t("studio.app.name")}</span>
        </div>
        <div className="topbar-fields">
          <Field label={t("studio.app.titleLabel")}>
            {(id) => <input id={id} className="input" value={title} maxLength={140} placeholder={t("studio.app.titlePlaceholder")} disabled={live} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <Field label={t("studio.app.categoryLabel")}>
            {(id) => (
              <select id={id} className="input" value={category} disabled={live} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{t("studio.app.categoryNone")}</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="field">
            <span className="field-label" id="orientation-label">
              {t("studio.app.orientation")}
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="orientation-label" title={live ? t("studio.app.orientationLocked") : undefined}>
              {(["landscape", "portrait"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={collection?.orientation === o}
                  disabled={live || !collection}
                  onClick={() => void window.studio.invoke("orientation.set", o)}
                >
                  {t(`studio.app.${o}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="topbar-account">
          <IconButton label={t("studio.app.settings")} icon={<SettingsIcon aria-hidden />} onClick={() => setSettingsOpen(true)} />
          <span className="avatar" aria-hidden>
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="account-name">{user.displayName}</span>
          <Button variant="ghost" size="sm" icon={<LogOut aria-hidden />} onClick={() => void signOut()} disabled={live} title={live ? t("studio.app.signOutLive") : undefined}>
            {t("studio.app.signOut")}
          </Button>
          {signOutError && <span className="sr-only" role="alert">{t("studio.app.signOutLive")}</span>}
        </div>
      </header>

      <aside className="left">
        <ScenesPanel collection={collection} />
        <SourcesPanel collection={collection} scene={activeScene} selected={selected} onSelect={setSelected} />
      </aside>

      <section className="center">
        <PreviewPanel collection={collection} scene={activeScene} selected={selected} onSelect={setSelected} />
        <MixerPanel collection={collection} scene={activeScene} />
      </section>

      <aside className="right">
        <ChatPanel broadcast={broadcast} />
      </aside>

      <StatusBar broadcast={broadcast} title={title} category={category} />

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {askQuit && (
        <Dialog
          title={t("studio.app.quitTitle")}
          onClose={() => setAskQuit(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAskQuit(false)}>
                {t("studio.app.cancel")}
              </Button>
              <Button variant="danger" onClick={() => void window.studio.invoke("quit.confirm")}>
                {t("studio.app.quitConfirm")}
              </Button>
            </>
          }
        >
          <p>{t("studio.app.quitBody")}</p>
        </Dialog>
      )}
    </div>
  );
}
