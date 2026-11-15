/*
  Antrean alert gift satu widget: satu alert tampil, sisanya menunggu (maks. `max`). Gift dari pengirim yang
  sama dengan gift yang sama digabung ke alert yang sedang tampil atau menunggu (kombo) — jumlah naik, dan
  alert yang sedang tampil diperpanjang SEKALI sebesar lama tampilnya. Antrean penuh dan tidak bisa digabung
  → gift tidak diantre, dihitung di `dropped`. Tiap alert mengingat pesan pembentuknya (`parts`), jadi pesan
  gift yang dihapus moderator / pengguna yang diblokir membatalkan bagiannya saja.
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

  const merged = (a, b) => ({ ...a, quantity: a.quantity + b.quantity, coinValue: a.coinValue + b.coinValue, parts: [...a.parts, ...b.parts] });
  const withParts = (a, parts) => ({ ...a, parts, quantity: parts.reduce((n, p) => n + p.quantity, 0), coinValue: parts.reduce((n, p) => n + p.coinValue, 0) });

  /** Buang bagian alert yang cocok; alert tanpa sisa bagian dibuang (menunggu) atau disembunyikan (tampil). */
  function drop(match) {
    for (const w of [...waiting]) {
      const parts = w.alert.parts.filter((p) => !match(w.alert, p));
      if (parts.length === w.alert.parts.length) continue;
      if (parts.length === 0) waiting = waiting.filter((x) => x !== w);
      else w.alert = withParts(w.alert, parts);
    }
    if (!current) return;
    const parts = current.alert.parts.filter((p) => !match(current.alert, p));
    if (parts.length === current.alert.parts.length) return;
    if (parts.length === 0) {
      if (current.timer) clearTimer(current.timer);
      hide();
      return;
    }
    current.alert = withParts(current.alert, parts);
    onUpdate({ ...current.alert, durationMs: current.endsAt - now() });
  }

  function enqueue(alert, durationMs) {
    const key = keyOf(alert);
    if (current && keyOf(current.alert) === key) {
      current.alert = merged(current.alert, alert);
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
      same.alert = merged(same.alert, alert);
      return;
    }
    if (waiting.length >= max) {
      dropped += 1;
      return;
    }
    waiting.push({ alert, durationMs });
    showNext();
  }

  const toAlert = (g, extra = {}) => ({ id: g.messageId, sender: g.sender, senderId: g.senderId ?? "", giftId: g.giftId, name: g.name, icon: g.icon, quantity: g.quantity, coinValue: g.coinValue, soundUrl: g.soundUrl ?? null, silent: g.silent === true, parts: [{ id: g.messageId, quantity: g.quantity, coinValue: g.coinValue }], ...extra });

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
    /** Pesan gift dihapus moderator: bagiannya dibatalkan. */
    cancel(messageId) {
      if (messageId) drop((_, p) => p.id === messageId);
    },
    /** Pesan pengguna dibersihkan (diblokir): semua alert darinya dibatalkan. */
    cancelSender(senderId) {
      if (senderId) drop((a) => !a.sample && a.senderId === String(senderId));
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
