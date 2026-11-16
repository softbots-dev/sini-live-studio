import { useEffect, useState } from "react";
import { ChevronDown, CircleHelp, LayoutDashboard, Pencil, RectangleHorizontal, RectangleVertical, Settings as SettingsIcon } from "lucide-react";
import type { User } from "../App";
import { useT } from "../i18n";
import { useMainState } from "../store";
import { Button, Dialog, IconButton } from "../ui";
import { TitleBar } from "../TitleBar";
import { SceneBar } from "../panels/Scenes";
import { SourcesPanel } from "../panels/Sources";
import { PreviewPanel } from "../panels/Preview";
import { PreviewToolbar } from "../panels/PreviewToolbar";
import { ControlBar, type BroadcastState } from "../panels/ControlBar";
import { SettingsDialog } from "../panels/Settings";
import { ChatPanel } from "../panels/Chat";
import { PerformancePanel } from "../panels/Performance";
import { TitleDialog } from "../panels/TitleDialog";
import { CampaignsCard } from "../panels/Campaigns";
import { SafeImg } from "../widget/SafeImg";

export type Item = {
  id: string;
  sourceId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  crop?: { left: number; right: number; top: number; bottom: number };
  rotation?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  visible: boolean;
  locked: boolean;
};
export type Scene = { id: string; name: string; items: Item[] };
export type Source = { id: string; kind: string; name: string; settings: Record<string, unknown>; volume: number; muted: boolean; monitoring: string; filters: { kind: string; settings?: Record<string, unknown> }[] };
export type Collection = { orientation: "landscape" | "portrait"; activeSceneId: string; scenes: Scene[]; sources: Source[] };

export const ACTIVE_PHASES = new Set(["starting", "connecting", "live", "reconnecting"]);

/*
  Layar utama (desain docs/superpowers/specs/2026-11-15-sini-live-studio-ui-redesign-design.md, mockup B):
  bilah judul (judul siaran di tengah, dasbor/bantuan/pengaturan/akun di kanan), kiri = tampilan studio +
  scene + sumber, tengah = pratinjau + kontrol, kanan = performa & chat.
*/
export function StudioScreen({ user }: { user: User }) {
  const { t } = useT();
  const initial = user.displayName.slice(0, 1).toUpperCase();
  const collection = useMainState<Collection | null>("scenes", "scenes.get", null);
  const broadcast = useMainState<BroadcastState>("broadcast", "broadcast.get", { phase: "idle" });
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("");
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const [cropMode, setCropMode] = useState(false);
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
  const categoryName = categories.find((c) => c.slug === category)?.name ?? null;

  const accountMenu = async () => {
    const picked = await window.studio.invoke<string | null>("menu.popup", [
      { id: "dashboard", label: t("studio.app.dashboard") },
      ...(channel?.slug ? [{ id: "channel", label: t("studio.app.viewChannel") }] : []),
      { type: "separator" },
      { id: "signout", label: live ? t("studio.app.signOutLive") : t("studio.app.signOut"), enabled: !live },
    ]);
    if (picked === "dashboard") void window.studio.invoke("open.web", "/dashboard/");
    if (picked === "channel") void window.studio.invoke("open.channel");
    if (picked === "signout") {
      const r = await window.studio.invoke<{ ok: boolean }>("account.signOut");
      setSignOutError(!r.ok);
    }
  };

  return (
    <div className="studio">
      <TitleBar
        center={
          <button type="button" className="title-pill" aria-label={t("studio.app.editTitle")} title={live ? t("studio.app.titleLocked") : undefined} onClick={() => setTitleOpen(true)}>
            <span className="title-pill-text">{title.trim() || t("studio.app.untitled")}</span>
            {categoryName && <span className="title-pill-cat">{categoryName}</span>}
            <Pencil aria-hidden />
          </button>
        }
        right={
          <>
            <IconButton label={t("studio.app.dashboard")} icon={<LayoutDashboard aria-hidden />} onClick={() => void window.studio.invoke("open.web", "/dashboard/")} />
            <IconButton label={t("studio.app.help")} icon={<CircleHelp aria-hidden />} onClick={() => void window.studio.invoke("open.web", "/studio/")} />
            <IconButton label={t("studio.app.settings")} icon={<SettingsIcon aria-hidden />} onClick={() => setSettingsOpen(true)} />
            <button type="button" className="account-chip" aria-label={t("studio.app.accountMenu")} onClick={() => void accountMenu()}>
              <span className="avatar" aria-hidden>
                {user.avatarUrl ? <SafeImg src={user.avatarUrl} fallback={initial} /> : initial}
              </span>
              <span className="account-name">{user.displayName}</span>
              <ChevronDown aria-hidden />
            </button>
            {signOutError && <span className="sr-only" role="alert">{t("studio.app.signOutLive")}</span>}
          </>
        }
      />

      <aside className="left">
        <section className="card" aria-labelledby="studio-view-title">
          <h2 id="studio-view-title" className="card-title">
            {t("studio.app.studioView")}
          </h2>
          <div className="seg" role="radiogroup" aria-labelledby="studio-view-title" title={live ? t("studio.app.orientationLocked") : undefined}>
            {(["portrait", "landscape"] as const).map((o) => (
              <button key={o} type="button" role="radio" aria-checked={collection?.orientation === o} disabled={live || !collection} onClick={() => void window.studio.invoke("orientation.set", o)}>
                {o === "portrait" ? <RectangleVertical aria-hidden /> : <RectangleHorizontal aria-hidden />}
                {t(`studio.app.${o}`)}
              </button>
            ))}
          </div>
        </section>
        <section className="card card-grow" aria-label={t("studio.app.sources")}>
          {collection && <SceneBar collection={collection} />}
          <SourcesPanel collection={collection} scene={activeScene} selected={selected} onSelect={setSelected} />
        </section>
        <CampaignsCard />
      </aside>

      <section className="center">
        <PreviewToolbar collection={collection} scene={activeScene} selected={selected} cropMode={cropMode} onCropMode={setCropMode} onDeselect={() => setSelected(null)} />
        <PreviewPanel collection={collection} scene={activeScene} selected={selected} onSelect={setSelected} cropMode={cropMode} />
        <ControlBar broadcast={broadcast} title={title} category={category} collection={collection} scene={activeScene} />
      </section>

      <aside className="right">
        <PerformancePanel broadcast={broadcast} />
        <ChatPanel broadcast={broadcast} />
      </aside>

      {titleOpen && (
        <TitleDialog
          title={title}
          category={category}
          categories={categories}
          live={live}
          onSave={(nextTitle, nextCategory) => {
            setTitle(nextTitle);
            setCategory(nextCategory);
          }}
          onClose={() => setTitleOpen(false)}
        />
      )}
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
