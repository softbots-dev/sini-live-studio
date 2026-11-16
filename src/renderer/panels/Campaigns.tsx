import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useT } from "../i18n";
import { useMainState } from "../store";
import { IconButton } from "../ui";

/** Dari proses utama (src/main/campaigns.mjs) — tanpa alamat tautan. */
type Campaign = { id: string; title: string; image: string; hasLink: boolean };

const ROTATE_MS = 6000;

/*
  Campaign dari panel admin (docs/live-studio.md § Campaign): banner 16:9 bergilir tiap 6 detik di bawah kartu
  sumber. Berhenti bergilir saat kursor/fokus ada di kartu. Banner tanpa tautan bukan tombol.
*/
export function CampaignsCard() {
  const { t } = useT();
  const items = useMainState<Campaign[]>("campaigns", "campaigns.get", []);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  const current = count ? items[Math.min(index, count - 1)] : null;

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [index, count]);
  useEffect(() => {
    if (count < 2 || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [count, paused]);

  if (!current) return null;
  const position = Math.min(index, count - 1);
  const image = <img src={current.image} alt="" />;

  return (
    <section
      className="card campaign-card"
      aria-roledescription="carousel"
      aria-label={t("studio.app.campaign.title")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="campaign-media">
        {current.hasLink ? (
          <button type="button" className="campaign-open" aria-label={t("studio.app.campaign.open", { title: current.title })} onClick={() => void window.studio.invoke("campaign.open", current.id)}>
            {image}
          </button>
        ) : (
          image
        )}
        <IconButton className="campaign-dismiss" label={t("studio.app.campaign.dismiss")} icon={<X aria-hidden />} onClick={() => void window.studio.invoke("campaign.dismiss", current.id)} />
      </div>
      <div className="campaign-foot">
        <p className="campaign-title" title={current.title}>
          {current.title}
        </p>
        {count > 1 && (
          <div className="campaign-dots">
            {items.map((c, i) => (
              <button key={c.id} type="button" aria-label={t("studio.app.campaign.slide", { n: i + 1, total: count })} aria-current={i === position} onClick={() => setIndex(i)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
