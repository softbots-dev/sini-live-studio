import { useEffect } from "react";
import { Ban, BadgeCheck, Clock, Crown, RefreshCw, Shield, ShieldCheck } from "lucide-react";
import { useT } from "../i18n";
import { useMainState } from "../store";
import { IconButton } from "../ui";
import { SafeImg } from "../widget/SafeImg";

export type Viewer = { id: string; username: string; displayName: string; color: string; badges: string[]; avatar: string | null };
type ViewersState = { status: "idle" | "loading" | "ready"; total: number; more: number; viewers: Viewer[] };

/** Sama dengan VIEWERS_REFRESH_MS di src/main/viewers.mjs. */
const REFRESH_MS = 15_000;

/*
  Tab Penonton: siapa saja yang sedang menonton (pengguna masuk; tamu tidak tercatat gateway). Diminta saat tab
  dibuka, tiap 15 dtk selama terbuka, dan dari tombol muat ulang. Bisukan & blokir sama dengan baris chat.
*/
export function ViewersPanel({ live, connected, onTimeout, onBan }: { live: boolean; connected: boolean; onTimeout: (v: Viewer) => void; onBan: (v: Viewer) => void }) {
  const { t, locale } = useT();
  const state = useMainState<ViewersState>("viewers", "viewers.get", { status: "idle", total: 0, more: 0, viewers: [] });
  const nf = new Intl.NumberFormat(locale);
  const refresh = () => void window.studio.invoke("viewers.refresh");

  useEffect(() => {
    if (!connected) return;
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [connected]);

  const badge = (b: string) => {
    if (b === "staff") return { key: b, icon: <ShieldCheck aria-hidden />, label: t("studio.app.viewers.badge.staff") };
    if (b === "moderator") return { key: b, icon: <Shield aria-hidden />, label: t("studio.app.viewers.badge.moderator") };
    if (b === "verified") return { key: b, icon: <BadgeCheck aria-hidden />, label: t("studio.app.viewers.badge.verified") };
    const level = /^member-(\d+)$/.exec(b)?.[1];
    if (level) return { key: b, icon: <Crown aria-hidden />, label: t("studio.app.viewers.badge.member", { level }), level };
    return null;
  };

  let body: React.ReactNode;
  if (!connected) body = <p className="empty">{t("studio.app.chat.connecting")}</p>;
  else if (state.status !== "ready") body = <p className="empty">{t("studio.app.viewers.loading")}</p>;
  else if (state.viewers.length === 0) body = <p className="empty">{live ? t("studio.app.viewers.empty") : t("studio.app.viewers.offline")}</p>;
  else
    body = (
      <ul className="viewer-list">
        {state.viewers.map((v) => {
          const initial = v.displayName.slice(0, 1).toUpperCase();
          const badges = v.badges.map(badge).filter((b) => b !== null);
          return (
            <li key={v.id} className="viewer-row">
              <span className="avatar viewer-avatar" aria-hidden>
                {v.avatar ? <SafeImg src={v.avatar} fallback={initial} /> : initial}
              </span>
              <span className="viewer-name">
                <strong style={{ color: v.color || undefined }}>{v.displayName}</strong>
                <span className="muted">@{v.username}</span>
              </span>
              {badges.length > 0 && (
                <span className="viewer-badges">
                  {badges.map((b) => (
                    <span key={b.key} className={`viewer-badge viewer-badge-${b.key.startsWith("member-") ? "member" : b.key}`} title={b.label}>
                      {b.icon}
                      {"level" in b && <span aria-hidden>{b.level}</span>}
                      <span className="sr-only">{b.label}</span>
                    </span>
                  ))}
                </span>
              )}
              {!v.badges.includes("staff") && (
                <span className="chat-actions viewer-actions">
                  <IconButton label={t("studio.app.chat.timeout", { name: v.displayName })} icon={<Clock aria-hidden />} onClick={() => onTimeout(v)} />
                  <IconButton label={t("studio.app.chat.ban", { name: v.displayName })} icon={<Ban aria-hidden />} onClick={() => onBan(v)} />
                </span>
              )}
            </li>
          );
        })}
        {state.more > 0 && <li className="viewer-more muted">{t("studio.app.viewers.more", { count: nf.format(state.more) })}</li>}
      </ul>
    );

  return (
    <div id="panel-viewers" role="tabpanel" aria-labelledby="tab-viewers" className="chat-body">
      <div className="viewer-head">
        <div>
          <p className="viewer-title">{t("studio.app.viewers.title", { count: nf.format(state.status === "ready" ? state.total : 0) })}</p>
          <p className="viewer-hint muted">{t("studio.app.viewers.hint")}</p>
        </div>
        <IconButton label={t("studio.app.viewers.refresh")} icon={<RefreshCw aria-hidden />} disabled={!connected} onClick={refresh} />
      </div>
      <div className="chat-list">
        {body}
      </div>
    </div>
  );
}
