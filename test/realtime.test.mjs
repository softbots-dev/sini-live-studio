// Klien WebSocket gateway (src/main/realtime.mjs) & model chat studio (src/main/chat-model.mjs).
// Aturan klien WebSocket Sini: `session` {user:false} padahal masuk → refresh sesi lalu sambung ulang
// (CLAUDE.md §4.19); tutup 1012/1013 → sambung ulang dengan jitter (§8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRealtime, realtimeUrl } from "../src/main/realtime.mjs";
import { createChatModel } from "../src/main/chat-model.mjs";

class FakeWS {
  static all = [];
  constructor(url, opts) {
    this.url = url;
    this.opts = opts;
    this.sent = [];
    this.handlers = {};
    this.closed = false;
    FakeWS.all.push(this);
  }
  on(ev, fn) {
    this.handlers[ev] = fn;
  }
  send(s) {
    this.sent.push(JSON.parse(s));
  }
  close() {
    this.closed = true;
  }
  emit(ev, ...args) {
    this.handlers[ev]?.(...args);
  }
}

function timers() {
  const list = [];
  return {
    list,
    setTimer: (fn, ms) => (list.push({ fn, ms }), list.length),
    clearTimer: () => {},
    clearInterval: () => {},
    setInterval: () => 0,
    async run(i = list.length - 1) {
      await list[i].fn();
    },
  };
}

test("realtimeUrl", () => {
  assert.equal(realtimeUrl("https://sini.live"), "wss://sini.live/realtime");
  assert.equal(realtimeUrl("http://localhost:3500"), "ws://localhost:3500/realtime");
});

test("sambung: header Origin & cookie, room.join channel sendiri", () => {
  FakeWS.all = [];
  const t = timers();
  const rt = createRealtime({ origin: "https://sini.live", cookieHeader: () => "sini_at=a", WebSocket: FakeWS, onEvent: () => {}, refreshSession: async () => true, signedIn: () => true, random: () => 0.5, ...t });
  rt.connect("raka");
  const ws = FakeWS.all[0];
  assert.equal(ws.url, "wss://sini.live/realtime");
  assert.deepEqual(ws.opts.headers, { origin: "https://sini.live", cookie: "sini_at=a" });
  ws.emit("open");
  assert.deepEqual(ws.sent[0], { type: "room.join", data: { slug: "raka" } });
});

test("session {user:false} saat masuk → refresh sekali lalu soket baru", async () => {
  FakeWS.all = [];
  const t = timers();
  let refreshed = 0;
  const rt = createRealtime({ origin: "https://sini.live", cookieHeader: () => "", WebSocket: FakeWS, onEvent: () => {}, refreshSession: async () => (++refreshed, true), signedIn: () => true, random: () => 0.5, ...t });
  rt.connect("raka");
  const ws = FakeWS.all[0];
  ws.emit("open");
  ws.emit("message", JSON.stringify({ type: "session", data: { user: false } }));
  await new Promise((r) => setImmediate(r));
  assert.equal(refreshed, 1);
  assert.equal(ws.closed, true);
  ws.emit("close", 1000);
  await t.run();
  assert.equal(FakeWS.all.length, 2, "soket baru");
});

test("tutup 1012 → sambung ulang dalam 1–5 dtk (jitter)", async () => {
  FakeWS.all = [];
  const t = timers();
  const rt = createRealtime({ origin: "https://sini.live", cookieHeader: () => "", WebSocket: FakeWS, onEvent: () => {}, refreshSession: async () => true, signedIn: () => true, random: () => 0.25, ...t });
  rt.connect("raka");
  FakeWS.all[0].emit("open");
  FakeWS.all[0].emit("close", 1012);
  const delay = t.list.at(-1).ms;
  assert.ok(delay >= 1000 && delay <= 5000, `delay ${delay}`);
  await t.run();
  assert.equal(FakeWS.all.length, 2);
  rt.disconnect();
  FakeWS.all[1].emit("close", 1000);
  assert.equal(t.list.filter((x) => x.ms >= 1000).length, 1, "tidak sambung ulang setelah disconnect");
});

test("model chat: pesan, total koin gift sesi, penonton & puncak", () => {
  const m = createChatModel();
  m.apply({ type: "room.state", data: { viewers: 3 } });
  m.apply({ type: "chat.message", data: { id: "1", type: "message", user: { id: "u", displayName: "Budi" }, body: "halo", createdAt: "2026-11-15T10:00:00Z" } });
  for (const [id, coins] of [["g1", 10], ["g2", 250], ["g3", 1000]])
    m.apply({ type: "chat.message", data: { id, type: "gift", user: { id: "u", displayName: "Budi" }, body: "", createdAt: "2026-11-15T10:00:00Z", gift: { name: "Mawar", quantity: 1, coinValue: coins } } });
  m.apply({ type: "presence.update", data: { viewers: 9 } });
  m.apply({ type: "presence.update", data: { viewers: 4 } });
  m.apply({ type: "chat.deleted", data: { messageId: "1" } });
  const s = m.snapshot();
  assert.equal(s.giftCoins, 1260);
  assert.equal(s.giftCount, 3);
  assert.equal(s.gifts.length, 3);
  assert.deepEqual([s.viewers, s.peakViewers], [4, 9]);
  assert.equal(s.messages.find((x) => x.id === "1").isDeleted, true);
  // Pesan yang sama datang dua kali (sambung ulang) tidak dihitung dua kali.
  m.apply({ type: "chat.message", data: { id: "g3", type: "gift", user: { id: "u", displayName: "Budi" }, body: "", createdAt: "x", gift: { coinValue: 1000, quantity: 1 } } });
  assert.equal(m.snapshot().giftCoins, 1260);
});
