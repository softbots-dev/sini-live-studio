import { useEffect, useState } from "react";
import { fmt, titleOf, type WidgetProps } from "./types";

/* Penghitung: judul + angka; diubah dari studio (+1 / −1 / atur ulang). */
export function CounterWidget({ t, settings, on }: WidgetProps) {
  const [value, setValue] = useState<number>(Number(settings.value) || 0);
  useEffect(() => on<{ value: number }>("counter", (d) => setValue(d.value)), [on]);
  return (
    <div className="w-card w-big">
      <span className="w-title">{titleOf(settings, t, "studio.app.wp.counterTitle")}</span>
      <span key={value} className="w-big-num w-pop">
        {fmt(value)}
      </span>
    </div>
  );
}
