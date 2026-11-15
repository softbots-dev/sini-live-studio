import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { SafeImg } from "./SafeImg";
import { fmt, titleOf, type RankRow, type WidgetProps } from "./types";

/* Ranking: penyawer teratas siaran ini (nilai koin gift, bukan diamond). */
export function RankingWidget({ t, settings, on }: WidgetProps) {
  const [rows, setRows] = useState<RankRow[]>([]);
  useEffect(() => on<{ rows: RankRow[] }>("ranking", (d) => setRows(d.rows)), [on]);
  return (
    <div className="w-card w-rank">
      <span className="w-title">{titleOf(settings, t, "studio.app.wp.rankingTitle")}</span>
      {rows.length === 0 ? (
        <p className="w-muted">{t("studio.app.wp.rankingEmpty")}</p>
      ) : (
        <ol className="w-rank-list">
          {rows.map((r, i) => (
            <li key={`${i}-${r.name}`} className={`w-rank-row rank-${i + 1}`}>
              <span className="w-rank-pos">{i + 1}</span>
              {r.avatarUrl ? <SafeImg className="w-avatar" src={r.avatarUrl} fallback={<span className="w-avatar w-avatar-empty" />} /> : <span className="w-avatar w-avatar-empty" />}
              <span className="w-rank-name">{r.name}</span>
              <span className="w-rank-coins">
                <Coins aria-hidden />
                {fmt(r.coins)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
