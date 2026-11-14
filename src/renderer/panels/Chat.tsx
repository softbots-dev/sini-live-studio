import { useEffect, useRef, useState } from "react";
import { Ban, Clock, Gem, Send, Trash2, Users } from "lucide-react";
import type { BroadcastState } from "./StatusBar";
import { useT } from "../i18n";
import { useMainState } from "../store";
import { Button, Dialog, IconButton } from "../ui";

type ChatMessage = {
  id: string;
  type: string;
  user: { id: string; username: string; displayName: string; color?: string };
  body: string;
  isDeleted?: boolean;
  gift?: { name: string; quantity: number; coinValue: number };
};
type ChatState = { status: "idle" | "connecting" | "connected"; messages: ChatMessage[]; gifts: ChatMessage[]; giftCoins: number; giftCount: number; viewers: number; peakViewers: number };

/*
  Chat & gift channel sendiri, tanpa jeda (pemilik melihat seketika). Gift TANPA suara — audio desktop
  menangkap semua suara komputer, jadi suara notifikasi akan ikut ke siaran. Angka gift dalam koin;
  diamond dilihat di Dasbor (potongan platform tidak publik).
*/
export function ChatPanel({ broadcast }: { broadcast: BroadcastState }) {
  const { t, locale } = useT();
  const chat = useMainState<ChatState>("chat", "chat.get", { status: "idle", messages: [], gifts: [], giftCoins: 0, giftCount: 0, viewers: 0, peakViewers: 0 });
  const [tab, setTab] = useState<"chat" | "gifts">("chat");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [banning, setBanning] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nf = new Intl.NumberFormat(locale);

  useEffect(() => window.studio.on("chat.rejected", () => setNotice(t("studio.app.chat.rejected"))), [t]);
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, tab]);

  const act = async (channel: string, ...args: unknown[]) => {
    const r = await window.studio.invoke<{ ok: boolean }>(channel, ...args);
    setNotice(r.ok ? null : t("studio.app.chat.actionFailed"));
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const ok = await window.studio.invoke<boolean>("chat.send", body);
    if (ok) {
      setText("");
      setNotice(null);
    } else setNotice(t("studio.app.chat.rejected"));
  };

  const line = (m: ChatMessage) => {
    if (m.isDeleted) return <em className="muted">{t("studio.app.chat.deleted")}</em>;
    if (m.type === "follow") return <span className="muted">{t("studio.app.chat.follow", { name: m.user.displayName })}</span>;
    if (m.type === "subscription") return <span className="muted">{t("studio.app.chat.subscription", { name: m.user.displayName })}</span>;
    if (m.type === "gift" && m.gift)
      return (
        <span className="gift-line">
          <Gem aria-hidden />
          {t("studio.app.gifts.item", { name: m.user.displayName, gift: m.gift.name, quantity: m.gift.quantity })}
        </span>
      );
    return (
      <>
        <strong style={{ color: m.user.color }}>{m.user.displayName}</strong> <span>{m.body}</span>
      </>
    );
  };

  return (
    <section className="panel panel-grow chat" aria-label={t("studio.app.chat.title")}>
      <header className="panel-head chat-head">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" id="tab-chat" aria-controls="panel-chat" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>
            {t("studio.app.chat.title")}
          </button>
          <button type="button" role="tab" id="tab-gifts" aria-controls="panel-gifts" aria-selected={tab === "gifts"} onClick={() => setTab("gifts")}>
            {t("studio.app.chat.giftsTab")}
          </button>
        </div>
        <span className="chat-viewers" title={t("studio.app.peakViewers", { count: nf.format(chat.peakViewers) })}>
          <Users aria-hidden />
          {t("studio.app.viewers", { count: nf.format(chat.viewers) })}
        </span>
      </header>

      {tab === "chat" ? (
        <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat" className="chat-body">
          <div ref={listRef} className="chat-list" aria-live="polite">
            {chat.status !== "connected" && broadcast.channel ? <p className="empty">{t("studio.app.chat.connecting")}</p> : null}
            {chat.status === "connected" && chat.messages.length === 0 && <p className="empty">{t("studio.app.chat.empty")}</p>}
            {chat.messages.map((m) => (
              <div key={m.id} className="chat-msg">
                <p>{line(m)}</p>
                {m.type === "message" && !m.isDeleted && (
                  <div className="chat-actions">
                    <IconButton label={t("studio.app.chat.delete", { name: m.user.displayName })} icon={<Trash2 aria-hidden />} onClick={() => void act("chat.delete", m.id)} />
                    <IconButton label={t("studio.app.chat.timeout", { name: m.user.displayName })} icon={<Clock aria-hidden />} onClick={() => void act("chat.ban", m.user.username, "timeout")} />
                    <IconButton label={t("studio.app.chat.ban", { name: m.user.displayName })} icon={<Ban aria-hidden />} onClick={() => setBanning(m)} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {notice && (
            <p className="msg-warn chat-notice" role="alert">
              {notice}
            </p>
          )}
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input className="input" value={text} maxLength={500} placeholder={t("studio.app.chat.placeholder")} aria-label={t("studio.app.chat.placeholder")} disabled={chat.status !== "connected"} onChange={(e) => setText(e.target.value)} />
            <IconButton label={t("studio.app.chat.send")} icon={<Send aria-hidden />} type="submit" disabled={chat.status !== "connected" || !text.trim()} />
          </form>
        </div>
      ) : (
        <div id="panel-gifts" role="tabpanel" aria-labelledby="tab-gifts" className="chat-body">
          <p className="gift-total">{t("studio.app.gifts.total", { count: nf.format(chat.giftCount), coins: nf.format(chat.giftCoins) })}</p>
          <div className="chat-list">
            {chat.gifts.length === 0 ? (
              <p className="empty">{t("studio.app.gifts.empty")}</p>
            ) : (
              chat.gifts.map((g) => (
                <div key={g.id} className="gift-row">
                  <span>{t("studio.app.gifts.item", { name: g.user.displayName, gift: g.gift?.name ?? "", quantity: g.gift?.quantity ?? 1 })}</span>
                  <span className="tabular muted">{t("studio.app.gifts.coins", { coins: nf.format(g.gift?.coinValue ?? 0) })}</span>
                </div>
              ))
            )}
          </div>
          <Button variant="ghost" size="sm" icon={<Gem aria-hidden />} onClick={() => void window.studio.invoke("open.web", "/dashboard/monetization/")}>
            {t("studio.app.gifts.diamonds")}
          </Button>
        </div>
      )}

      {banning && (
        <Dialog
          title={t("studio.app.chat.banTitle", { name: banning.user.displayName })}
          onClose={() => setBanning(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setBanning(null)}>
                {t("studio.app.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void act("chat.ban", banning.user.username, "permanent");
                  setBanning(null);
                }}
              >
                {t("studio.app.chat.banConfirm")}
              </Button>
            </>
          }
        >
          <p>{t("studio.app.chat.banBody", { name: banning.user.displayName })}</p>
        </Dialog>
      )}
    </section>
  );
}
