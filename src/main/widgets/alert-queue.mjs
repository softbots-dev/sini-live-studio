/*
  Antrean alert gift satu widget: satu alert tampil, sisanya menunggu (maks. `max`). Gift dari pengirim yang
  sama dengan gift yang sama digabung ke alert yang sedang tampil atau menunggu (kombo) — jumlah naik, dan
  alert yang sedang tampil diperpanjang SEKALI sebesar lama tampilnya. Antrean penuh dan tidak bisa digabung
  → gift tidak diantre, dihitung di `dropped`.
*/
const GAP_MS = 400;
const SEEN_MAX = 1000;

export function createAlertQueue({ now, setTimer, clearTimer, onShow, onUpdate, onHide, max = 20 }) {
  let current = null; // { alert, endsAt, extended, durationMs, timer }
  let waiting = [];
  let dropped = 0;
  let gapTimer = null;
  let seen = new Set();

  const keyOf = (a) => (a.sample ? `\u0000sample|${a.id}` : `${a.sender.anonymous ? "\u0000anon" : a.senderId || a.sender.name}|${a.giftId}`);

  function remember(id) {
    seen.add(id);
    if (seen.size > SEEN_MAX) seen = new Set([...seen].slice(-SEEN_MAX / 2));
  }

  function schedule(ms) {
    if (current.timer) clearTimer(current.timer);
    current.timer = setTimer(hide, Math.max(0, ms));
  }

  function hide() {
    const id = current.alert.id;
    current = null;
    onHide(id);
    gapTimer = setTimer(() => {
      gapTimer = null;
      showNext();
    }, GAP_MS);
  }

  function showNext() {
    if (current || gapTimer || waiting.length === 0) return;
    const next = waiting.shift();
    current = { alert: next.alert, durationMs: next.durationMs, endsAt: now() + next.durationMs, extended: false, timer: null };
    schedule(next.durationMs);
    onShow({ ...current.alert, durationMs: next.durationMs });
  }

  function enqueue(alert, durationMs) {
    const key = keyOf(alert);
    if (current && keyOf(current.alert) === key) {
      current.alert = { ...current.alert, quantity: current.alert.quantity + alert.quantity, coinValue: current.alert.coinValue + alert.coinValue };
      if (!current.extended) {
        current.extended = true;
        current.endsAt += current.durationMs;
        schedule(current.endsAt - now());
      }
      onUpdate({ ...current.alert, durationMs: current.endsAt - now() });
      return;
    }
    const same = waiting.find((w) => keyOf(w.alert) === key);
    if (same) {
      same.alert = { ...same.alert, quantity: same.alert.quantity + alert.quantity, coinValue: same.alert.coinValue + alert.coinValue };
      return;
    }
    if (waiting.length >= max) {
      dropped += 1;
      return;
    }
    waiting.push({ alert, durationMs });
    showNext();
  }

  const toAlert = (g, extra = {}) => ({ id: g.messageId, sender: g.sender, senderId: g.senderId ?? "", giftId: g.giftId, name: g.name, icon: g.icon, quantity: g.quantity, coinValue: g.coinValue, soundUrl: g.soundUrl ?? null, silent: g.silent === true, ...extra });

  return {
    push(gift, { durationMs, minCoins }) {
      if (!gift?.messageId || seen.has(gift.messageId)) return;
      remember(gift.messageId);
      if (!(gift.coinValue >= minCoins)) return;
      enqueue(toAlert(gift), durationMs);
    },
    /** Alert contoh dari tombol Uji — tanpa gift minimum, tidak digabung dengan gift sungguhan. */
    test(sample, { durationMs }) {
      enqueue(toAlert(sample, { sample: true }), durationMs);
    },
    /** Alert yang sedang tampil (untuk halaman yang baru tersambung). */
    showing() {
      return current ? { ...current.alert, durationMs: Math.max(0, current.endsAt - now()) } : null;
    },
    snapshot() {
      return { current: current?.alert.id ?? null, waiting: waiting.length, dropped };
    },
    reset() {
      if (current?.timer) clearTimer(current.timer);
      if (gapTimer) clearTimer(gapTimer);
      current = null;
      gapTimer = null;
      waiting = [];
      dropped = 0;
      seen = new Set();
    },
  };
}
