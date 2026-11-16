// Alat interaktif live di Sini Live Studio (src/main/interact.mjs): keadaan dari GET + event interact.*,
// aksi lewat HTTP yang menjawab { ok, code } (tidak melempar), kunci idempotensi peti dipakai ulang.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInteract, wishGifts } from "../src/main/interact.mjs";

class HttpErr extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function harness(state = { live: true, goal: null, poll: null, wishes: [], treasure: null }) {
  const calls = [];
  const states = [];
  let fail = null;
  const reply = (method, path, body) => {
    calls.push([method, path, body]);
    if (fail) throw fail;
    return { status: 200, data: path === "/me/channel/interact" ? state : path === "/wallet" ? { coinBalance: 5000 } : {} };
  };
  const http = {
    get: async (p) => reply("GET", p),
    post: async (p, b) => reply("POST", p, b),
    put: async (p, b) => reply("PUT", p, b),
    del: async (p) => reply("DELETE", p),
  };
  const it = createInteract({ http, onState: (s) => states.push(s) });
  return { it, calls, states, setFail: (e) => (fail = e), setState: (s) => (state = s) };
}

test("refresh mengambil keadaan dan mengabarkannya", async () => {
  const h = harness();
  await h.it.refresh();
  assert.deepEqual(h.calls[0], ["GET", "/me/channel/interact", undefined]);
  assert.equal(h.states.at(-1).live, true);
});

test("event interact.poll memperbarui keadaan; event lain diabaikan", async () => {
  const h = harness();
  await h.it.refresh();
  h.it.apply({ type: "interact.poll", data: { poll: { id: "p", options: [{ text: "a", votes: 2 }] } } });
  assert.equal(h.it.state().poll.options[0].votes, 2);
  const n = h.states.length;
  h.it.apply({ type: "chat.message", data: {} });
  assert.equal(h.states.length, n);
  h.it.apply({ type: "interact.treasure", data: { box: { id: "b", claimed: 1 } } });
  assert.equal(h.it.state().treasure.claimed, 1);
  h.it.apply({ type: "interact.goal", data: { goal: null } });
  assert.equal(h.it.state().goal, null);
});

test("startTreasure memakai kunci idempotensi yang sama saat dicoba ulang", async () => {
  const h = harness();
  const input = { coins: 1000, slots: 5, countdownSec: 60, audience: "all" };
  await h.it.startTreasure(input, "kunci-1");
  await h.it.startTreasure(input, "kunci-1");
  const posts = h.calls.filter((c) => c[0] === "POST");
  assert.equal(posts.length, 2);
  assert.equal(posts[0][1], "/me/channel/interact/treasure");
  assert.equal(posts[0][2].idempotencyKey, "kunci-1");
  assert.equal(posts[1][2].idempotencyKey, "kunci-1");
});

test("galat HTTP diteruskan sebagai kode, bukan dilempar", async () => {
  const h = harness();
  h.setFail(new HttpErr(409, "not_live"));
  assert.deepEqual(await h.it.startGoal({ kind: "coins", target: 10 }), { ok: false, code: "not_live" });
  h.setFail(new HttpErr(402, "insufficient_coins"));
  assert.deepEqual(await h.it.startTreasure({ coins: 1000, slots: 1, countdownSec: 60, audience: "all" }, "k"), { ok: false, code: "insufficient_coins" });
  h.setFail(new Error("boom"));
  assert.deepEqual(await h.it.closePoll(), { ok: false, code: "request_failed" });
});

test("aksi memakai jalur & metode yang benar lalu menyegarkan keadaan", async () => {
  const h = harness();
  assert.deepEqual(await h.it.startGoal({ kind: "coins", target: 10 }), { ok: true });
  await h.it.endGoal();
  await h.it.startPoll({ question: "Q", options: ["a", "b"], durationSec: 60 });
  await h.it.closePoll();
  await h.it.setWishes([{ giftId: "g", target: 3 }]);
  const paths = h.calls.filter((c) => c[0] !== "GET").map((c) => `${c[0]} ${c[1]}`);
  assert.deepEqual(paths, [
    "POST /me/channel/interact/goal",
    "DELETE /me/channel/interact/goal",
    "POST /me/channel/interact/poll",
    "POST /me/channel/interact/poll/close",
    "PUT /me/channel/interact/wishes",
  ]);
  assert.deepEqual(h.calls.find((c) => c[0] === "PUT")[2], { items: [{ giftId: "g", target: 3 }] });
  assert.ok(h.calls.filter((c) => c[1] === "/me/channel/interact").length >= 5);
  assert.equal(await h.it.wallet(), 5000);
});

test("wishGifts: hanya gift global yang aktif, urut sortOrder", () => {
  const gifts = [
    { id: "b", name: "B", icon: "x", coinPrice: 5, isGlobal: true, isActive: true, sortOrder: 2 },
    { id: "a", name: "A", icon: "x", coinPrice: 1, isGlobal: true, isActive: true, sortOrder: 1 },
    { id: "c", name: "C", icon: "x", coinPrice: 1, isGlobal: false, isActive: true, sortOrder: 0 },
    { id: "d", name: "D", icon: "x", coinPrice: 1, isGlobal: true, isActive: false, sortOrder: 0 },
  ];
  assert.deepEqual(wishGifts(gifts).map((g) => g.id), ["a", "b"]);
  assert.deepEqual(wishGifts(null), []);
});
