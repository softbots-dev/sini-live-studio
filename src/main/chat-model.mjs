/*
  Model chat studio: pesan terakhir (maks. 200), gift sesi ini (sejak studio tersambung ke room), total
  KOIN gift (bukan diamond — potongan platform tidak publik; diamond dilihat di Dasbor), penonton & puncak.
*/
const MAX_MESSAGES = 200;
const MAX_GIFTS = 100;

export function createChatModel() {
  let messages = [];
  let gifts = [];
  let giftCoins = 0;
  let giftCount = 0;
  let viewers = 0;
  let peakViewers = 0;
  const seen = new Set();

  const setViewers = (n) => {
    viewers = Number.isFinite(n) ? n : 0;
    peakViewers = Math.max(peakViewers, viewers);
  };

  return {
    apply({ type, data }) {
      if (type === "room.state" || type === "presence.update") return setViewers(Number(data?.viewers ?? 0));
      if (type === "chat.message" && data?.id) {
        if (seen.has(data.id)) return;
        seen.add(data.id);
        messages = [...messages, data].slice(-MAX_MESSAGES);
        if (data.type === "gift" && data.gift) {
          giftCount += 1;
          giftCoins += Math.max(0, Math.round(Number(data.gift.coinValue) || 0));
          gifts = [data, ...gifts].slice(0, MAX_GIFTS);
        }
        return;
      }
      if (type === "chat.deleted") {
        messages = messages.map((m) => (m.id === data?.messageId ? { ...m, isDeleted: true } : m));
        return;
      }
      if (type === "chat.cleared") messages = messages.map((m) => (m.user?.id === data?.userId ? { ...m, isDeleted: true } : m));
    },
    snapshot() {
      return { messages, gifts, giftCoins, giftCount, viewers, peakViewers };
    },
    reset() {
      messages = [];
      gifts = [];
      giftCoins = giftCount = 0;
      viewers = peakViewers = 0;
      seen.clear();
    },
  };
}
