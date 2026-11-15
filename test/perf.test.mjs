// Poller Performa LIVE (src/main/perf.mjs): ambil sekali saat mulai lalu tiap 30 dtk; refresh (event
// stats.changed) dibatasi 1× per 5 dtk; berhenti = timer batal + kabar { session: null }.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPerfPoller, PERF_INTERVAL_MS } from "../src/main/perf.mjs";

function harness(result = { session: { id: "s", startedAt: "x" }, diamonds: 1 }) {
  let clock = 0;
  const timers = new Map();
  let next = 1;
  const calls = [];
  const changes = [];
  let fail = false;
  const poller = createPerfPoller({
    fetch: async () => {
      calls.push(clock);
      if (fail) throw new Error("x");
      return result;
    },
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    onChange: (v) => changes.push(v),
  });
  const flush = () => new Promise((r) => setImmediate(r));
  const fire = async () => {
    const [[id, t]] = [...timers];
    timers.delete(id);
    clock += t.ms;
    t.fn();
    await flush();
  };
  return { poller, calls, changes, timers, flush, fire, advance: (ms) => (clock += ms), setFail: (v) => (fail = v) };
}

test("mulai: ambil sekali, kabarkan, jadwalkan 30 dtk", async () => {
  const h = harness();
  h.poller.start();
  await h.flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.changes.at(-1).diamonds, 1);
  assert.deepEqual([...h.timers.values()].map((t) => t.ms), [PERF_INTERVAL_MS]);
  assert.equal(PERF_INTERVAL_MS, 30000);
  await h.fire();
  assert.equal(h.calls.length, 2);
});

test("refresh dibatasi satu kali per 5 dtk", async () => {
  const h = harness();
  h.poller.start();
  await h.flush();
  h.advance(1000);
  h.poller.refresh();
  await h.flush();
  assert.equal(h.calls.length, 1);
  h.advance(5000);
  h.poller.refresh();
  h.poller.refresh();
  await h.flush();
  assert.equal(h.calls.length, 2);
  assert.equal(h.timers.size, 1);
});

test("galat tidak menghentikan jadwal; berhenti membatalkan timer dan mengabarkan session null", async () => {
  const h = harness();
  h.setFail(true);
  h.poller.start();
  await h.flush();
  assert.equal(h.timers.size, 1);
  h.poller.stop();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.changes.at(-1), { session: null });
  h.poller.refresh();
  await h.flush();
  assert.equal(h.calls.length, 1);
});
