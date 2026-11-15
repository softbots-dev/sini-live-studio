import { useEffect, useState } from "react";
import { Gift, Heart, Star } from "lucide-react";
import type { ChatLine, WidgetProps } from "./types";

/* Chatbox: pesan terbaru dari bawah ke atas; baris yang dihapus moderator ikut hilang (daftar penuh dari hub). */
export function ChatboxWidget({ t, settings, on }: WidgetProps) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  useEffect(() => on<{ lines: ChatLine[] }>("chat", (d) => setLines(d.lines)), [on]);
  return (
    <div className={`w-chat size-${settings.fontSize ?? "medium"}`}>
      {lines.map((l) => {
        const name = l.sample ? t("studio.app.wp.sampleName") : l.anonymous ? t("studio.app.wp.anonymous") : l.name;
        return (
          <div key={l.id} className={`w-chat-line kind-${l.kind}`}>
            {l.kind === "gift" && <Gift aria-hidden className="w-chat-ico" />}
            {l.kind === "follow" && <Heart aria-hidden className="w-chat-ico" />}
            {l.kind === "member" && <Star aria-hidden className="w-chat-ico" />}
            <span className="w-chat-name" style={{ color: l.color }}>
              {name}
            </span>
            <span className="w-chat-body">
              {l.kind === "text" && (l.sample ? t("studio.app.wp.sampleChat") : l.body)}
              {l.kind === "gift" && t("studio.app.wp.event.gift", { gift: l.gift?.name ?? "", count: l.gift?.quantity ?? 1 })}
              {l.kind === "follow" && t("studio.app.wp.event.follow")}
              {l.kind === "member" && t("studio.app.wp.event.member")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
