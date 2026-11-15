/*
  Hub widget: SATU-SATUNYA pemegang keadaan widget di proses utama (antrean alert, hitung mundur, goal,
  ranking, baris chat). Halaman widget berlangganan lewat server lokal (server.mjs); saat tersambung mereka
  langsung menerima `config` + keadaan terakhir, jadi halaman yang dimuat ulang OBS tidak pernah kosong.
  Data dari server Sini dibentuk ulang di sini — halaman tidak pernah melihat pesan mentah.
*/
import { createAlertQueue } from "./alert-queue.mjs";
import { createCountdown } from "./countdown.mjs";

const CHAT_KEEP = 15;
const SEEN_MAX = 2000;
const LINE_KIND = { message: "text", gift: "gift", follow: "follow", subscription: "member" };
const GOAL_FIELD = { coins: "coins", gifts: "gifts", followers: "newFollowers", members: "newMembers" };

/**
 * @param {{ now: () => number, setTimer: (fn: () => void, ms: number) => any, clearTimer: (id: any) => void, absUrl: (u: string) => string, soundFor: (id: string) => ({ url: string | null, silent: boolean } | null), onCountdown?: (id: string, state: { running: boolean, remainingMs: number, at: number }) => void }} deps
 */
export function createWidgetHub({ now, setTimer, clearTimer, absUrl, soundFor, onCountdown = () => {} }) {
  const widgets = new Map(); // id → { type, settings, queue?, countdown? }
  const subs = new Map(); // id → Set<send>
  let locale = "en";
  let perf = { session: null };
  let ranking = [];
  let lines = [];
  let seen = new Set();

  const sendTo = (id, event, data) => {
    for (const send of subs.get(id) ?? []) {
      try {
        send(event, data);
      } catch {
        // koneksi yang sedang tertutup
      }
    }
  };
  const ofType = (type) => [...widgets.entries()].filter(([, w]) => w.type === type);

  const goalValue = (w) => {
    if (!perf?.session) return 0;
    return Math.max(0, Number(perf[GOAL_FIELD[w.settings.goal]] ?? 0) || 0);
  };
  // Baris GET /v1/channels/<slug>/supporters: { user: { displayName, username, avatarUrl }, diamonds (= koin gift) }.
  const rankingRows = (w) =>
    ranking.slice(0, w.settings.rows).map((r) => ({ name: r.user?.displayName || r.user?.username || "", avatarUrl: r.user?.avatarUrl ? absUrl(r.user.avatarUrl) : null, coins: Math.max(0, Number(r.diamonds) || 0) }));
  const chatLines = (w) => {
    const shown = w.settings.showEvents ? lines : lines.filter((l) => l.kind === "text");
    return shown.slice(-w.settings.rows).map(({ userId, ...line }) => line);
  };

  /** Keadaan jenis widget sebagai [event, data][] — untuk halaman yang baru tersambung. */
  function snapshot(id, w) {
    switch (w.type) {
      case "alert": {
        const showing = w.queue.showing();
        // resume: halaman yang tersambung ulang di tengah alert tidak memutar suaranya lagi.
        return showing ? [["alert.show", publicAlert({ ...showing, resume: true })]] : [];
      }
      case "goal":
        return [["goal", { value: goalValue(w), target: w.settings.target }]];
      case "counter":
        return [["counter", { value: w.settings.value }]];
      case "countdown":
        return [["countdown", w.countdown.state()]];
      case "ranking":
        return [["ranking", { rows: rankingRows(w) }]];
      case "chatbox":
        return [["chat", { lines: chatLines(w) }]];
      default:
        return [];
    }
  }
  const sendAll = (id) => {
    const w = widgets.get(id);
    if (!w) return;
    sendTo(id, "config", { type: w.type, settings: w.settings, locale });
    for (const [event, data] of snapshot(id, w)) sendTo(id, event, data);
  };

  const publicAlert = (a) => ({ id: a.id, sender: a.sender, name: a.name, icon: a.icon, quantity: a.quantity, soundUrl: a.soundUrl, silent: a.silent, durationMs: a.durationMs, ...(a.sample ? { sample: true } : {}), ...(a.resume ? { resume: true } : {}) });

  function makeWidget(id, type, settings) {
    const w = { type, settings };
    if (type === "alert")
      w.queue = createAlertQueue({
        now,
        setTimer,
        clearTimer,
        onShow: (a) => sendTo(id, "alert.show", publicAlert(a)),
        onUpdate: (a) => sendTo(id, "alert.update", { id: a.id, quantity: a.quantity }),
        onHide: (alertId) => sendTo(id, "alert.hide", { id: alertId }),
      });
    if (type === "countdown") w.countdown = createCountdown({ durationMs: settings.durationSec * 1000, now });
    return w;
  }

  /** Timer "habis" hitung mundur yang berjalan: halaman & dialog Properti tahu jamnya berhenti. */
  function armCountdown(id, w) {
    if (w.cdTimer) clearTimer(w.cdTimer);
    w.cdTimer = null;
    const state = w.countdown.state();
    if (!state.running) return;
    w.cdTimer = setTimer(() => {
      w.cdTimer = null;
      const done = w.countdown.state();
      // Timer menyala sebelum jamnya habis (jam dinding bergeser): pasang ulang, jangan kabarkan apa-apa.
      if (done.running) return armCountdown(id, w);
      sendTo(id, "countdown", done);
      onCountdown(id, done);
    }, state.remainingMs);
  }
  const dispose = (w) => {
    w.queue?.reset();
    if (w.cdTimer) clearTimer(w.cdTimer);
    w.cdTimer = null;
  };

  /** Baris chat: pesan dan event masing-masing maks. CHAT_KEEP, supaya event tidak menggusur pesan. */
  const keep = (list) => {
    let text = 0;
    let events = 0;
    const out = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i];
      if (l.kind === "text" ? text++ < CHAT_KEEP : events++ < CHAT_KEEP) out.push(l);
    }
    return out.reverse();
  };

  function remember(id) {
    seen.add(id);
    if (seen.size > SEEN_MAX) seen = new Set([...seen].slice(-SEEN_MAX / 2));
  }

  const pushChat = () => {
    for (const [id, w] of ofType("chatbox")) sendTo(id, "chat", { lines: chatLines(w) });
  };

  function giftFrom(data) {
    const g = data.gift ?? {};
    const anonymous = !data.user?.id && data.user?.username === "anonim";
    const sound = soundFor(g.id) ?? null;
    return {
      messageId: data.id,
      sender: { name: anonymous ? "" : data.user?.displayName || data.user?.username || "", avatarUrl: !anonymous && g.senderAvatarUrl ? absUrl(g.senderAvatarUrl) : null, anonymous },
      senderId: anonymous ? "" : String(data.user?.id ?? ""),
      giftId: g.id ?? "",
      name: g.name ?? "",
      icon: g.icon ? absUrl(g.icon) : null,
      quantity: Math.max(1, Math.round(Number(g.quantity) || 1)),
      coinValue: Math.max(0, Math.round(Number(g.coinValue) || 0)),
      soundUrl: sound?.url ?? null,
      silent: sound?.silent === true,
    };
  }

  return {
    /** Daftar widget koleksi (scenes.widgets()) — yang hilang dilepas, yang berubah disiarkan ulang. */
    setWidgets(list) {
      const ids = new Set(list.map((w) => w.id));
      for (const [id, w] of widgets) {
        if (ids.has(id)) continue;
        dispose(w);
        widgets.delete(id);
      }
      for (const { id, type, settings } of list) {
        const prev = widgets.get(id);
        if (prev && prev.type === type) {
          if (JSON.stringify(prev.settings) === JSON.stringify(settings)) continue;
          if (type === "countdown" && prev.settings.durationSec !== settings.durationSec) prev.countdown.setDuration(settings.durationSec * 1000);
          prev.settings = settings;
        } else {
          if (prev) dispose(prev);
          widgets.set(id, makeWidget(id, type, settings));
        }
        sendAll(id);
      }
    },

    setLocale(code) {
      if (!code || code === locale) return;
      locale = code;
      for (const id of widgets.keys()) sendTo(id, "config", { type: widgets.get(id).type, settings: widgets.get(id).settings, locale });
    },

    onRealtime({ type, data }) {
      if (type === "chat.message" && data?.id) {
        if (seen.has(data.id)) return;
        remember(data.id);
        const kind = LINE_KIND[data.type];
        if (!kind) return;
        const gift = data.type === "gift" && data.gift ? giftFrom(data) : null;
        lines = [
          ...lines,
          {
            id: data.id,
            kind,
            userId: data.user?.id ?? "",
            name: gift?.sender.anonymous ? "" : data.user?.displayName || data.user?.username || "",
            anonymous: gift?.sender.anonymous === true,
            color: typeof data.user?.color === "string" ? data.user.color : "#ffffff",
            body: kind === "text" ? String(data.body ?? "") : "",
            ...(gift ? { gift: { name: gift.name, icon: gift.icon, quantity: gift.quantity } } : {}),
          },
        ];
        lines = keep(lines);
        pushChat();
        if (gift) for (const [, w] of ofType("alert")) w.queue.push(gift, { durationMs: w.settings.durationSec * 1000, minCoins: w.settings.minCoins });
        return;
      }
      if (type === "chat.deleted" && data?.messageId) {
        lines = lines.filter((l) => l.id !== data.messageId);
        pushChat();
        for (const [, w] of ofType("alert")) w.queue.cancel(data.messageId);
        return;
      }
      if (type === "chat.cleared" && data?.userId) {
        lines = lines.filter((l) => l.userId !== data.userId);
        pushChat();
        // Hanya blokir: penonton yang di-timeout tetap sah gift-nya (tetap di goal/ranking), alertnya tetap.
        if (data.ban?.type === "ban") for (const [, w] of ofType("alert")) w.queue.cancelSender(data.userId);
      }
    },

    setPerf(value) {
      perf = value ?? { session: null };
      for (const [id, w] of ofType("goal")) sendTo(id, "goal", { value: goalValue(w), target: w.settings.target });
    },

    setRanking(rows) {
      ranking = Array.isArray(rows) ? rows : [];
      for (const [id, w] of ofType("ranking")) sendTo(id, "ranking", { rows: rankingRows(w) });
    },

    counterChanged(id, value) {
      const w = widgets.get(id);
      if (!w || w.type !== "counter") return;
      w.settings = { ...w.settings, value };
      sendTo(id, "counter", { value });
    },

    countdown(id, op) {
      const w = widgets.get(id);
      if (!w || w.type !== "countdown") return null;
      if (op === "reset") w.countdown.reset();
      else w.countdown.toggle();
      armCountdown(id, w);
      const state = w.countdown.state();
      sendTo(id, "countdown", state);
      return state;
    },

    countdownState(id) {
      const w = widgets.get(id);
      return w?.type === "countdown" ? w.countdown.state() : null;
    },

    /** Tombol Uji: gift/pesan contoh hanya ke widget itu, tidak ke Sini. */
    test(id) {
      const w = widgets.get(id);
      if (!w) return;
      const sampleId = `sample-${now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (w.type === "alert") w.queue.test({ messageId: sampleId, sender: { name: "", avatarUrl: null, anonymous: false }, giftId: "sample", name: "", icon: null, quantity: 1, coinValue: 1, soundUrl: null, silent: false }, { durationMs: w.settings.durationSec * 1000 });
      if (w.type === "chatbox") sendTo(id, "chat", { lines: [...chatLines(w), { id: sampleId, kind: "text", name: "", anonymous: false, sample: true, color: "#7dd3fc", body: "" }].slice(-w.settings.rows) });
    },

    subscribe(id, send) {
      if (!subs.has(id)) subs.set(id, new Set());
      subs.get(id).add(send);
      const w = widgets.get(id);
      if (w) {
        send("config", { type: w.type, settings: w.settings, locale });
        for (const [event, data] of snapshot(id, w)) send(event, data);
      }
      return () => {
        subs.get(id)?.delete(send);
        if (subs.get(id)?.size === 0) subs.delete(id);
      };
    },

    /** Jumlah baris tiap widget ranking (poller mengambil sebanyak yang terbesar). */
    rankingSizes() {
      return ofType("ranking").map(([, w]) => w.settings.rows);
    },

    /** Pindah room chat: baris & alert room lama dibuang (id pesan room lain boleh muncul lagi). */
    roomChanged() {
      lines = [];
      seen = new Set();
      for (const [id, w] of ofType("alert")) {
        w.queue.reset();
        sendTo(id, "alert.hide", { id: null });
      }
      pushChat();
    },

    /** Ganti akun / keluar: tidak ada sisa akun lama. */
    reset() {
      for (const w of widgets.values()) {
        dispose(w);
        w.countdown?.reset();
      }
      perf = { session: null };
      ranking = [];
      lines = [];
      seen = new Set();
      for (const id of widgets.keys()) for (const [event, data] of snapshot(id, widgets.get(id))) sendTo(id, event, data);
      for (const [id] of ofType("alert")) sendTo(id, "alert.hide", { id: null });
    },
  };
}
