// Sambungan widget di proses utama: poller ranking (src/main/widgets/ranking-poller.mjs) dan suara gift dari
// katalog (src/main/widgets/catalog-sounds.mjs). Jam & timer palsu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRankingPoller } from "../src/main/widgets/ranking-poller.mjs";
import { createCatalogSounds } from "../src/main/widgets/catalog-sounds.mjs";

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
    pending: () => timers.size,
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
        await new Promise((r) => setImmediate(r));
      }
      t = end;
      await new Promise((r) => setImmediate(r));
    },
  };
}

test("ranking: ambil segera saat mulai, lalu tiap 60 dtk; nudge dibatasi 10 dtk (ditunda, tidak hilang)", async () => {
  const c = clock();
  const fetches = [];
  const changes = [];
  const p = createRankingPoller({ ...c, fetch: async () => (fetches.push(c.now()), [{ id: "u" }]), onChange: (rows) => changes.push(rows) });
  p.start();
  await c.advance(0);
  assert.deepEqual(fetches, [0]);
  await c.advance(2000);
  p.nudge();
  p.nudge();
  await c.advance(1000);
  assert.deepEqual(fetches, [0]);
  await c.advance(7000);
  assert.deepEqual(fetches, [0, 10_000]);
  await c.advance(60_000);
  assert.deepEqual(fetches, [0, 10_000, 70_000]);
  p.stop();
  assert.deepEqual(changes.at(-1), []);
  await c.advance(200_000);
  assert.equal(fetches.length, 3);
  assert.equal(c.pending(), 0);
  p.nudge();
  await c.advance(20_000);
  assert.equal(fetches.length, 3);
});

test("ranking: jawaban yang datang setelah berhenti dibuang", async () => {
  const c = clock();
  let resolve;
  const changes = [];
  const p = createRankingPoller({ ...c, fetch: () => new Promise((r) => (resolve = r)), onChange: (rows) => changes.push(rows) });
  p.start();
  await new Promise((r) => setImmediate(r));
  p.stop();
  resolve([{ id: "basi" }]);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(changes, [[]]);
});

test("suara katalog: lib → URL absolut, none → diam, lainnya → bawaan; id tak dikenal memuat ulang ≤ 1×/60 dtk", async () => {
  let t = 0;
  let loads = 0;
  const gifts = [
    { id: "a", sound: "lib:11111111-2222-3333-4444-555555555555" },
    { id: "b", sound: "none" },
    { id: "c", sound: "synth" },
    { id: "d", sound: null },
  ];
  const s = createCatalogSounds({ origin: "https://sini.test/", now: () => t, fetch: async () => (loads++, { gifts }) });
  await s.load();
  assert.deepEqual(s.soundFor("a"), { url: "https://sini.test/v1/gift-sounds/11111111-2222-3333-4444-555555555555", silent: false });
  assert.deepEqual(s.soundFor("b"), { url: null, silent: true });
  assert.deepEqual(s.soundFor("c"), { url: null, silent: false });
  assert.deepEqual(s.soundFor("d"), { url: null, silent: false });
  assert.equal(loads, 1);
  t = 10_000;
  assert.equal(s.soundFor("baru"), null);
  s.soundFor("baru2");
  await new Promise((r) => setImmediate(r));
  assert.equal(loads, 1); // < 60 dtk sejak muat terakhir
  t = 70_000;
  s.soundFor("baru");
  await new Promise((r) => setImmediate(r));
  assert.equal(loads, 2);
});
