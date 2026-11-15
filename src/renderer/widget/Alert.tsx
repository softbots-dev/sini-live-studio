import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { chime } from "./chime";
import { SafeImg } from "./SafeImg";
import { isUrl, type AlertData, type WidgetProps } from "./types";

/* Alert gift: kartu masuk dari bawah, ikon berdenyut, keluar memudar. Antrean & kombo diatur proses utama. */
export function AlertWidget({ t, settings, on }: WidgetProps) {
  const [alert, setAlert] = useState<AlertData | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const offs = [
      on<AlertData>("alert.show", (a) => {
        if (timer) clearTimeout(timer);
        setLeaving(false);
        setAlert(a);
        // resume = halaman tersambung ulang di tengah alert: suaranya sudah diputar.
        if (settings.sound === false || a.silent || a.resume) return;
        if (a.soundUrl) void new Audio(a.soundUrl).play().catch(() => chime());
        else chime();
      }),
      on<{ id: string; quantity: number }>("alert.update", (u) => setAlert((cur) => (cur && cur.id === u.id ? { ...cur, quantity: u.quantity } : cur))),
      on<{ id: string | null }>("alert.hide", () => {
        setLeaving(true);
        timer = setTimeout(() => setAlert(null), 350);
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      if (timer) clearTimeout(timer);
    };
  }, [on, settings.sound]);

  if (!alert) return null;
  const name = alert.sample ? t("studio.app.wp.sampleName") : alert.sender.anonymous ? t("studio.app.wp.anonymous") : alert.sender.name;
  const giftName = alert.sample ? t("studio.app.wp.sampleGift") : alert.name;
  return (
    <div className="w-alert-stage">
      <div key={alert.id} className={`w-alert ${leaving ? "is-leaving" : ""}`}>
        <div className="w-alert-icon">{isUrl(alert.icon) ? <SafeImg src={alert.icon} fallback={<Gift aria-hidden />} /> : alert.icon ? <span className="w-alert-glyph">{alert.icon}</span> : <Gift aria-hidden />}</div>
        <div className="w-alert-text">
          <div className="w-alert-sender">
            {alert.sender.avatarUrl && <SafeImg className="w-avatar" src={alert.sender.avatarUrl} />}
            <span>{name}</span>
          </div>
          <div className="w-alert-gift">{t("studio.app.wp.sent", { gift: giftName })}</div>
        </div>
        <div key={alert.quantity} className="w-alert-qty">×{alert.quantity}</div>
      </div>
    </div>
  );
}
