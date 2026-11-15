import { useEffect, useState } from "react";
import { fmt, titleOf, type WidgetProps } from "./types";

/* Goal: bilah progres dibatasi 100%, angka menunjukkan nilai sebenarnya (per sesi siaran). */
export function GoalWidget({ t, settings, on }: WidgetProps) {
  const [goal, setGoal] = useState({ value: 0, target: Number(settings.target) || 1 });
  useEffect(() => on<{ value: number; target: number }>("goal", setGoal), [on]);
  const pct = Math.min(100, (goal.value / Math.max(1, goal.target)) * 100);
  return (
    <div className="w-card w-goal">
      <div className="w-goal-head">
        <span className="w-title">{titleOf(settings, t, "studio.app.wp.goalTitle")}</span>
        <span className="w-goal-num">
          {fmt(goal.value)} / {fmt(goal.target)} <span className="w-unit">{t(`studio.app.wp.goal.${settings.goal ?? "coins"}`)}</span>
        </span>
      </div>
      <div className="w-goal-track">
        <div className="w-goal-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
