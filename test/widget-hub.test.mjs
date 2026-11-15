// Hub widget (src/main/widgets/hub.mjs, alert-queue.mjs, countdown.mjs): keadaan semua widget di proses utama
// dan event yang dikirim ke halaman widget. Jam & timer palsu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAlertQueue } from "../src/main/widgets/alert-queue.mjs";
import { createCountdown } from "../src/main/widgets/countdown.mjs";
import { createWidgetHub } from "../src/main/widgets/hub.mjs";

function clock() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    },
  };
}

const gift = (messageId, name, giftId = "rose", coinValue = 10, quantity = 1) => ({ messageId, sender: { name, avatarUrl: null, anonymous: false }, giftId, name: giftId, icon: "x", quantity, coinValue, soundUrl: null, silent: false });

function queue(c, max) {
  const log = [];
  const q = createAlertQueue({ ...c, max, onShow: (a) => log.push(["show", a.id, c.now(), a.quantity]), onUpdate: (a) => log.push(["update", a.id, c.now(), a.quantity]), onHide: (id) => log.push(["hide", id, c.now()]) });
  return { q, log };
}
const OPTS = { durationMs: 5000, minCoins: 1 };

test("alert: satu per satu, jeda 400 ms; gift minimum; id sama diabaikan", () => {
  const c = clock();
  const { q, log } = queue(c);
  q.push(gift("a", "Budi"), OPTS);
  q.push(gift("a", "Budi"), OPTS);
  q.push(gift("b", "Sinta", "lion"), OPTS);
  q.push(gift("c", "Raka", "rose", 5), { durationMs: 5000, minCoins: 10 });
  c.advance(20000);
  assert.deepEqual(log, [
    ["show", "a", 0, 1],
    ["hide", "a", 5000],
    ["show", "b", 5400, 1],
    ["hide", "b", 10400],
  ]);
});

test("alert kombo: pengirim+gift sama digabung, waktu tampil diperpanjang sekali", () => {
  const c = clock();
  const { q, log } = queue(c);
  q.push(gift("a", "Budi"), OPTS);
  c.advance(1000);
  q.push(gift("a2", "Budi"), OPTS);
  c.advance(1000);
  q.push(gift("a3", "Budi"), OPTS);
  c.advance(20000);
  assert.deepEqual(log, [
    ["show", "a", 0, 1],
    ["update", "a", 1000, 2],
    ["update", "a", 2000, 3],
    ["hide", "a", 10000],
  ]);
});

test("alert: gift yang menunggu juga digabung; antrean maks. 20, sisanya dihitung dropped", () => {
  const c = clock();
  const { q, log } = queue(c);
  q.push(gift("x", "Pertama"), OPTS);
  for (let i = 0; i < 24; i++) q.push(gift(`g${i}`, `P${i}`), OPTS);
  q.push(gift("g0b", "P0"), OPTS); // digabung ke P0 yang menunggu
  assert.equal(q.snapshot().waiting, 20);
  assert.equal(q.snapshot().dropped, 4);
  c.advance(5400);
  assert.deepEqual(log.at(-1), ["show", "g0", 5400, 2]);
  q.reset();
  assert.deepEqual(q.snapshot(), { current: null, waiting: 0, dropped: 0 });
});

test("hitung mundur: mulai, jeda, lanjut, habis, atur ulang", () => {
  const c = clock();
  const cd = createCountdown({ durationMs: 300_000, now: c.now });
  assert.deepEqual(cd.state(), { running: false, remainingMs: 300_000, at: 0 });
  cd.toggle();
  c.advance(60_000);
  cd.toggle();
  assert.deepEqual(cd.state(), { running: false, remainingMs: 240_000, at: 60_000 });
  c.advance(10_000);
  cd.toggle();
  c.advance(300_000);
  assert.deepEqual(cd.state(), { running: false, remainingMs: 0, at: 370_000 });
  cd.toggle(); // habis → mulai lagi dari penuh
  assert.equal(cd.state().running, true);
  assert.equal(cd.state().remainingMs, 300_000);
  cd.reset();
  assert.deepEqual(cd.state(), { running: false, remainingMs: 300_000, at: 370_000 });
  cd.setDuration(10_000);
  assert.equal(cd.state().remainingMs, 10_000);
});

function hub() {
  const c = clock();
  const h = createWidgetHub({ ...c, absUrl: (u) => (typeof u === "string" && u.startsWith("/") ? `https://sini.test${u}` : u), soundFor: (id) => (id === "rose" ? { url: "https://sini.test/v1/gift-sounds/r", silent: false } : null) });
  const sub = (id) => {
    const got = [];
    h.subscribe(id, (event, data) => got.push([event, data]));
    return got;
  };
  return { c, h, sub };
}
const W = {
  alert: { id: "w-alert", type: "alert", settings: { widget: "alert", durationSec: 5, minCoins: 1, sound: true } },
  goal: { id: "w-goal", type: "goal", settings: { widget: "goal", goal: "coins", target: 100, title: "" } },
  chat: { id: "w-chat", type: "chatbox", settings: { widget: "chatbox", fontSize: "medium", rows: 3, showEvents: true } },
  rank: { id: "w-rank", type: "ranking", settings: { widget: "ranking", title: "", rows: 3 } },
  counter: { id: "w-count", type: "counter", settings: { widget: "counter", title: "", value: 4 } },
  cd: { id: "w-cd", type: "countdown", settings: { widget: "countdown", title: "", durationSec: 300 } },
};
const msg = (id, type, extra = {}) => ({ type: "chat.message", data: { id, type, user: { id: `u-${id}`, username: "budi", displayName: "Budi", color: "#f00" }, body: "halo", ...extra } });

test("hub: subscribe mengirim config lalu snapshot jenisnya", () => {
  const { h, sub } = hub();
  h.setLocale("id");
  h.setWidgets(Object.values(W));
  h.setPerf({ session: { id: "s" }, coins: 40, gifts: 3, newFollowers: 1, newMembers: 0 });
  const goal = sub("w-goal");
  assert.deepEqual(goal[0], ["config", { type: "goal", settings: W.goal.settings, locale: "id" }]);
  assert.deepEqual(goal[1], ["goal", { value: 40, target: 100 }]);
  assert.deepEqual(sub("w-count")[1], ["counter", { value: 4 }]);
  assert.deepEqual(sub("w-cd")[1], ["countdown", { running: false, remainingMs: 300_000, at: 0 }]);
  h.setPerf({ session: null });
  assert.deepEqual(goal.at(-1), ["goal", { value: 0, target: 100 }]);
});

test("hub: subscriber untuk widget yang belum terdaftar menerima config begitu widget ditambah", () => {
  const { h, sub } = hub();
  const early = sub("w-count");
  assert.equal(early.length, 0);
  h.setWidgets([W.counter]);
  assert.equal(early[0][0], "config");
  assert.deepEqual(early[1], ["counter", { value: 4 }]);
});

test("hub: gift → alert (URL absolut, suara katalog), chat → chatbox (dibatasi baris, id sama sekali)", () => {
  const { h, sub } = hub();
  h.setWidgets([W.alert, W.chat]);
  const alert = sub("w-alert");
  const chat = sub("w-chat");
  h.onRealtime(msg("g1", "gift", { gift: { id: "rose", name: "Mawar", icon: "/v1/media/rose.png", quantity: 2, coinValue: 20, senderAvatarUrl: "/v1/media/a.png" } }));
  const show = alert.find((e) => e[0] === "alert.show")[1];
  assert.equal(show.icon, "https://sini.test/v1/media/rose.png");
  assert.equal(show.sender.avatarUrl, "https://sini.test/v1/media/a.png");
  assert.equal(show.soundUrl, "https://sini.test/v1/gift-sounds/r");
  assert.equal(show.quantity, 2);
  assert.equal(show.durationMs, 5000);
  for (const id of ["m1", "m2", "m3", "m4"]) h.onRealtime(msg(id, "message"));
  h.onRealtime(msg("m4", "message"));
  const lines = chat.at(-1)[1].lines;
  assert.deepEqual(lines.map((l) => l.id), ["m2", "m3", "m4"]);
  h.onRealtime({ type: "chat.deleted", data: { messageId: "m3" } });
  assert.deepEqual(chat.at(-1)[1].lines.map((l) => l.id), ["m1", "m2", "m4"]);
});

test("hub: gift anonim tanpa nama & avatar; showEvents:false hanya pesan teks", () => {
  const { h, sub } = hub();
  const chatOnly = { ...W.chat, settings: { ...W.chat.settings, showEvents: false } };
  h.setWidgets([W.alert, chatOnly]);
  const alert = sub("w-alert");
  const chat = sub("w-chat");
  h.onRealtime({ type: "chat.message", data: { id: "g", type: "gift", user: { id: "", username: "anonim", displayName: "Anonim", color: "#fff" }, body: "", gift: { id: "lion", name: "Singa", icon: "x", quantity: 1, coinValue: 50, senderAvatarUrl: null } } });
  h.onRealtime(msg("f", "follow"));
  h.onRealtime(msg("t", "message"));
  const show = alert.find((e) => e[0] === "alert.show")[1];
  assert.deepEqual(show.sender, { name: "", avatarUrl: null, anonymous: true });
  assert.equal(show.soundUrl, null);
  assert.deepEqual(chat.at(-1)[1].lines.map((l) => l.id), ["t"]);
});

test("hub: ranking dipotong ke baris widget; penghitung & hitung mundur; uji hanya ke widget itu; reset", () => {
  const { c, h, sub } = hub();
  h.setWidgets([W.rank, W.counter, W.cd, W.alert, { ...W.alert, id: "w-alert2" }]);
  const rank = sub("w-rank");
  // Bentuk asli GET /v1/channels/<slug>/supporters (analytics.service.ts topSupporters).
  h.setRanking([1, 2, 3, 4, 5].map((n) => ({ user: { id: `u${n}`, username: `u${n}`, displayName: `U${n}`, avatarUrl: n === 2 ? "" : "/v1/media/x.png", isVerified: false }, diamonds: 100 - n, giftCount: 1, rank: n })));
  assert.deepEqual(rank.at(-1)[1].rows[0], { name: "U1", avatarUrl: "https://sini.test/v1/media/x.png", coins: 99 });
  assert.equal(rank.at(-1)[1].rows.length, 3);
  assert.deepEqual(rank.at(-1)[1].rows[1], { name: "U2", avatarUrl: null, coins: 98 });
  const count = sub("w-count");
  h.counterChanged("w-count", 5);
  assert.deepEqual(count.at(-1), ["counter", { value: 5 }]);
  const cd = sub("w-cd");
  h.countdown("w-cd", "toggle");
  assert.equal(cd.at(-1)[1].running, true);
  c.advance(1000);
  assert.equal(h.countdownState("w-cd").remainingMs, 299_000);
  const a1 = sub("w-alert");
  const a2 = sub("w-alert2");
  h.test("w-alert");
  assert.ok(a1.some((e) => e[0] === "alert.show" && e[1].sample === true));
  assert.ok(!a2.some((e) => e[0] === "alert.show"));
  h.reset();
  assert.deepEqual(rank.at(-1), ["ranking", { rows: [] }]);
  assert.equal(h.countdownState("w-cd").running, false);
});

test("alert kombo per AKUN, bukan per nama tampilan: dua \"Budi\" berbeda tidak digabung", () => {
  const { h, sub } = hub();
  h.setWidgets([W.alert]);
  const alert = sub("w-alert");
  const g = (id, userId) => ({ type: "chat.message", data: { id, type: "gift", user: { id: userId, username: `budi_${userId}`, displayName: "Budi", color: "#fff" }, body: "", gift: { id: "rose", name: "Mawar", icon: "x", quantity: 1, coinValue: 10, senderAvatarUrl: null } } });
  h.onRealtime(g("a", "u1"));
  h.onRealtime(g("b", "u2"));
  h.onRealtime(g("c", "u1"));
  assert.deepEqual(alert.filter((e) => e[0] === "alert.update").map((e) => e[1]), [{ id: "a", quantity: 2 }]);
});
