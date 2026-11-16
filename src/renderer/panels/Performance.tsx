import { Eye, Gem, Gift, MessageSquareText, UserPlus, UserRoundCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { useMainState } from "../store";
import { useDuration, type BroadcastState } from "./ControlBar";

type Perf = { session: null; failed?: boolean } | { session: { id: string; startedAt: string }; diamonds: number; gifts: number; newFollowers: number; newMembers: number; chatters: number };

/*
  Performa siaran yang sedang berjalan (GET /v1/me/channel/live-stats lewat event `perf`) + penonton dari
  presence realtime. Di luar siaran: keadaan kosong, BUKAN angka nol (aturan "tidak ada angka karangan").
*/
export function PerformancePanel({ broadcast }: { broadcast: BroadcastState }) {
  const { t, locale } = useT();
  const perf = useMainState<Perf>("perf", "perf.get", { session: null });
  const chat = useMainState<{ viewers: number }>("chat", "chat.get", { viewers: 0 });
  const live = broadcast.phase === "live" || broadcast.phase === "reconnecting";
  const duration = useDuration(broadcast.phase === "live" ? broadcast.liveSince : null);
  const nf = new Intl.NumberFormat(locale);

  return (
    <section className="card perf" aria-labelledby="perf-title">
      <div className="perf-head">
        <h2 id="perf-title" className="card-title">
          {t("studio.app.perf.title")}
        </h2>
        {duration && <span className="tabular muted">{duration}</span>}
      </div>
      {live && perf.session ? (
        <div className="perf-grid">
          <Metric nf={nf} icon={<Eye />} value={chat.viewers} label={t("studio.app.perf.viewers")} />
          <Metric nf={nf} icon={<Gem />} value={perf.diamonds} label={t("studio.app.perf.diamonds")} />
          <Metric nf={nf} icon={<Gift />} value={perf.gifts} label={t("studio.app.perf.gifts")} />
          <Metric nf={nf} icon={<UserPlus />} value={perf.newFollowers} label={t("studio.app.perf.followers")} />
          <Metric nf={nf} icon={<UserRoundCheck />} value={perf.newMembers} label={t("studio.app.perf.members")} />
          <Metric nf={nf} icon={<MessageSquareText />} value={perf.chatters} label={t("studio.app.perf.chatters")} />
        </div>
      ) : (
        <p className="perf-empty">{t(live && perf.session === null && perf.failed ? "studio.app.perf.failed" : "studio.app.perf.empty")}</p>
      )}
    </section>
  );
}

function Metric({ icon, value, label, nf }: { icon: ReactNode; value: number; label: string; nf: Intl.NumberFormat }) {
  return (
    <div className="metric">
      <span className="metric-icon" aria-hidden>
        {icon}
      </span>
      <span className="metric-value tabular">{nf.format(value)}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}
