import { Headphones, HeadphoneOff, Volume2, VolumeX } from "lucide-react";
import type { Collection, Scene } from "../screens/Studio";
import { useT } from "../i18n";
import { useMainState } from "../store";
import { IconButton } from "../ui";

const AUDIO = new Set(["wasapi_input_capture", "wasapi_output_capture", "dshow_input"]);

/** Peak dBFS (−60…0) → persen meter. */
const meter = (db: number | undefined) => (typeof db === "number" && Number.isFinite(db) ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0);

export function MixerPanel({ collection, scene }: { collection: Collection | null; scene: Scene | null }) {
  const { t } = useT();
  const levels = useMainState<Record<string, number[]>>("volmeter", null, {});
  if (!collection || !scene) return null;
  const used = new Set(scene.items.map((i) => i.sourceId));
  const sources = collection.sources.filter((s) => AUDIO.has(s.kind) && used.has(s.id));

  return (
    <section className="panel mixer" aria-labelledby="mixer-title">
      <header className="panel-head">
        <h2 id="mixer-title">{t("studio.app.mixer")}</h2>
      </header>
      {sources.length === 0 ? (
        <p className="empty">{t("studio.app.noAudio")}</p>
      ) : (
        <ul className="mixer-list">
          {sources.map((s) => {
            const peak = Math.max(...(levels[s.id] ?? [-Infinity]));
            return (
              <li key={s.id} className="mixer-row">
                <span className="mixer-name">{s.name}</span>
                <div className="meter" aria-hidden>
                  <span style={{ width: `${s.muted ? 0 : meter(peak)}%` }} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={s.volume}
                  aria-label={t("studio.app.volume", { name: s.name })}
                  onChange={(e) => void window.studio.invoke("audio.volume", s.id, Number(e.target.value))}
                />
                <IconButton
                  label={s.muted ? t("studio.app.unmute", { name: s.name }) : t("studio.app.mute", { name: s.name })}
                  pressed={s.muted}
                  icon={s.muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
                  onClick={() => void window.studio.invoke("audio.mute", s.id, !s.muted)}
                />
                <IconButton
                  label={s.monitoring === "none" ? t("studio.app.monitorOn", { name: s.name }) : t("studio.app.monitorOff", { name: s.name })}
                  pressed={s.monitoring !== "none"}
                  icon={s.monitoring === "none" ? <HeadphoneOff aria-hidden /> : <Headphones aria-hidden />}
                  onClick={() => void window.studio.invoke("audio.monitor", s.id, s.monitoring === "none" ? "monitorAndOutput" : "none")}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
