// Mesin status siaran Sini Live Studio (src/main/broadcast-machine.mjs) — alur sama dengan aplikasi
// Android (docs/phone-live.md): kesiapan → start → kirim → ping sampai live; sambung ulang ±60 dtk; alamat
// kirim hanya di closure mesin, tidak pernah di snapshot yang dikirim ke tampilan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBroadcastMachine } from "../src/main/broadcast-machine.mjs";
import { StudioHttpError } from "../src/main/http.mjs";
import { liveMaintenance } from "../src/main/maintenance.mjs";
import { splitPublishUrl } from "../src/main/publish-url.mjs";

const PUBLISH = "rtmps://ingest.uji.invalid:443/app/sk_rahasia_123456";
const PROFILE = { width: 1920, height: 1080, fps: 30, videoKbps: 6000 };

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
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        await next[1].fn();
        await new Promise((r) => setImmediate(r));
      }
      t = end;
    },
  };
}

function fakeHttp(routes) {
  const calls = [];
  const call = async (method, path, body) => {
    calls.push({ method, path, body });
    const r = routes[`${method} ${path}`];
    const out = typeof r === "function" ? await r(body, calls) : r;
    if (out instanceof Error) throw out;
    if (!out) throw new StudioHttpError(404, "not_found");
    return out;
  };
  return { calls, get: (p) => call("GET", p), post: (p, b) => call("POST", p, b) };
}

function fakeEngine() {
  const log = [];
  return {
    log,
    startStream: async (o) => log.push({ op: "start", ...o }),
    stopStream: async () => log.push({ op: "stop" }),
  };
}

const ready = { status: 200, data: { ready: true, blocker: null, channel: { id: "c1", isLive: false } } };

function machine(routes, extra = {}) {
  const c = clock();
  const http = fakeHttp(routes);
  const engine = fakeEngine();
  const states = [];
  const m = createBroadcastMachine({ http, engine, liveMaintenance: async () => false, ...c, onChange: (s) => states.push(s), ...extra });
  return { m, c, http, engine, states };
}

function noSecret(snapshot) {
  const s = JSON.stringify(snapshot);
  assert.ok(!s.includes("sk_rahasia") && !s.includes("ingest.uji.invalid"), `rahasia bocor: ${s}`);
}

test("splitPublishUrl memisah server & key tanpa membocorkan isi saat galat", () => {
  assert.deepEqual(splitPublishUrl("rtmps://h:443/app/k3y"), { server: "rtmps://h:443/app/", key: "k3y" });
  for (const bad of ["", "rtmps://h:443/app/", "nope", "http://h/app/k"]) {
    assert.throws(() => splitPublishUrl(bad), (err) => err.message === "publish_invalid" && !err.message.includes(bad || "x"));
  }
});

test("liveMaintenance: global atau fitur live", () => {
  assert.equal(liveMaintenance({ maintenanceMode: false, featureMaintenance: {} }), false);
  assert.equal(liveMaintenance({ maintenanceMode: true }), true);
  assert.equal(liveMaintenance({ maintenanceMode: false, featureMaintenance: { live: { enabled: true } } }), true);
  assert.equal(liveMaintenance({ maintenanceMode: false, featureMaintenance: { social: { enabled: true } } }), false);
});

test("kesiapan: blocker, bukan streamer, akun dibekukan, pemeliharaan, sudah live", async () => {
  let r = machine({ "GET /me/channel/broadcast": { status: 200, data: { ready: false, blocker: "no_key", channel: { id: "c1", isLive: false } } } });
  await r.m.check();
  assert.deepEqual([r.m.snapshot().phase, r.m.snapshot().reason], ["blocked", "no_key"]);

  r = machine({ "GET /me/channel/broadcast": new StudioHttpError(403, "forbidden") });
  await r.m.check();
  assert.equal(r.m.snapshot().reason, "not_streamer");

  r = machine({ "GET /me/channel/broadcast": new StudioHttpError(403, "account_suspended") });
  await r.m.check();
  assert.equal(r.m.snapshot().reason, "account_suspended");

  r = machine({ "GET /me/channel/broadcast": ready }, { liveMaintenance: async () => true });
  await r.m.check();
  assert.equal(r.m.snapshot().reason, "maintenance");

  r = machine({ "GET /me/channel/broadcast": { status: 200, data: { ready: true, blocker: null, channel: { id: "c1", isLive: true } } } });
  await r.m.check();
  assert.deepEqual([r.m.snapshot().phase, r.m.snapshot().alreadyLive], ["ready", true]);
});

test("start → kirim → ping tiap 4 dtk sampai live; alamat tidak pernah di snapshot", async () => {
  let pings = 0;
  const r = machine({
    "GET /me/channel/broadcast": ready,
    "POST /me/channel/broadcast/start": { status: 200, data: { publishUrl: PUBLISH, profile: PROFILE } },
    "POST /me/channel/broadcast/ping": () => ({ status: 200, data: ++pings >= 3 ? { isLive: true, liveStartedAt: "2026-11-15T10:00:00.000Z" } : { isLive: false, liveStartedAt: null } }),
  });
  await r.m.check();
  await r.m.start({ title: "Uji", categorySlug: null, orientation: "portrait" });
  const startCall = r.http.calls.find((c) => c.path === "/me/channel/broadcast/start");
  assert.deepEqual(startCall.body, { client: "studio", orientation: "portrait", title: "Uji", categorySlug: null });
  assert.deepEqual(r.engine.log[0], { op: "start", server: "rtmps://ingest.uji.invalid:443/app/", key: "sk_rahasia_123456", profile: PROFILE });
  assert.equal(r.m.snapshot().phase, "connecting");
  r.m.outputStarted();
  await r.c.advance(4000);
  assert.equal(r.m.snapshot().phase, "connecting");
  await r.c.advance(8000);
  assert.equal(r.m.snapshot().phase, "live");
  assert.equal(r.m.snapshot().liveSince, "2026-11-15T10:00:00.000Z");
  assert.equal(pings, 3);
  await r.c.advance(60000);
  assert.equal(pings, 3, "ping berhenti setelah live");
  for (const s of r.states) noSecret(s);
});

test("tanpa isLive selama 90 dtk → slowStart, ping tiap 15 dtk", async () => {
  let pings = 0;
  const r = machine({
    "GET /me/channel/broadcast": ready,
    "POST /me/channel/broadcast/start": { status: 200, data: { publishUrl: PUBLISH, profile: PROFILE } },
    "POST /me/channel/broadcast/ping": () => (++pings, { status: 200, data: { isLive: false, liveStartedAt: null } }),
  });
  await r.m.check();
  await r.m.start({ orientation: "landscape" });
  r.m.outputStarted();
  await r.c.advance(92000);
  assert.equal(r.m.snapshot().slowStart, true);
  const before = pings;
  await r.c.advance(15000);
  assert.equal(pings, before + 1);
});

test("putus → sambung ulang dengan alamat yang sama; habis 60 dtk → failed; start baru minta alamat baru", async () => {
  let starts = 0;
  const r = machine({
    "GET /me/channel/broadcast": ready,
    "POST /me/channel/broadcast/start": () => (++starts, { status: 200, data: { publishUrl: PUBLISH, profile: PROFILE } }),
    "POST /me/channel/broadcast/ping": { status: 200, data: { isLive: true, liveStartedAt: "2026-11-15T10:00:00.000Z" } },
  });
  await r.m.check();
  await r.m.start({ orientation: "landscape" });
  r.m.outputStarted();
  await r.c.advance(4000);
  assert.equal(r.m.snapshot().phase, "live");

  r.m.outputStopped("disconnected");
  assert.equal(r.m.snapshot().phase, "reconnecting");
  await r.c.advance(2000);
  const restarts = r.engine.log.filter((l) => l.op === "start");
  assert.ok(restarts.length >= 2, "engine dimulai ulang");
  assert.equal(restarts.at(-1).key, "sk_rahasia_123456", "alamat yang sama");
  r.m.outputStarted();
  assert.equal(r.m.snapshot().phase, "live");

  r.m.outputStopped("disconnected");
  await r.c.advance(61000);
  assert.deepEqual([r.m.snapshot().phase, r.m.snapshot().code], ["failed", "reconnect_exhausted"]);
  assert.equal(r.engine.log.at(-1).op, "stop");
  assert.equal(starts, 1);
  await r.m.start({ orientation: "landscape" });
  assert.equal(starts, 2, "Coba lagi = start baru");
  for (const s of r.states) noSecret(s);
});

test("sesi hilang saat live → siaran dihentikan, alamat dibuang", async () => {
  const r = machine({
    "GET /me/channel/broadcast": ready,
    "POST /me/channel/broadcast/start": { status: 200, data: { publishUrl: PUBLISH, profile: PROFILE } },
    "POST /me/channel/broadcast/ping": { status: 200, data: { isLive: true, liveStartedAt: null } },
  });
  await r.m.check();
  await r.m.start({ orientation: "landscape" });
  r.m.outputStarted();
  await r.c.advance(4000);
  r.m.authLost();
  assert.deepEqual([r.m.snapshot().phase, r.m.snapshot().reason], ["ended", "auth_lost"]);
  assert.equal(r.engine.log.at(-1).op, "stop");
  // Sambung ulang setelah ini tidak boleh memakai alamat lama.
  r.m.outputStopped("disconnected");
  await r.c.advance(5000);
  assert.equal(r.engine.log.filter((l) => l.op === "start").length, 1);
});

test("ping 403 (role dicabut) saat live → berhenti; start 409/429/503 dipetakan", async () => {
  let r = machine({
    "GET /me/channel/broadcast": ready,
    "POST /me/channel/broadcast/start": { status: 200, data: { publishUrl: PUBLISH, profile: PROFILE } },
    "POST /me/channel/broadcast/ping": new StudioHttpError(403, "forbidden"),
  });
  await r.m.check();
  await r.m.start({ orientation: "landscape" });
  r.m.outputStarted();
  await r.c.advance(4000);
  assert.deepEqual([r.m.snapshot().phase, r.m.snapshot().reason], ["ended", "not_streamer"]);
  assert.equal(r.engine.log.at(-1).op, "stop");

  r = machine({ "GET /me/channel/broadcast": ready, "POST /me/channel/broadcast/start": new StudioHttpError(409, "broadcast_key_rotating") });
  await r.m.check();
  await r.m.start({ orientation: "landscape" });
  assert.deepEqual([r.m.snapshot().phase, r.m.snapshot().reason], ["blocked", "key_rotating"]);

  r = machine({ "GET /me/channel/broadcast": ready, "POST /me/channel/broadcast/start": new StudioHttpError(429, "rate_limited", 120000) });
  await r.m.check();
  await r.m.start({ orientation: "landscape" });
  assert.deepEqual([r.m.snapshot().phase, r.m.snapshot().code, r.m.snapshot().retryAfterMs], ["failed", "rate_limited", 120000]);

  r = machine({ "GET /me/channel/broadcast": ready, "POST /me/channel/broadcast/start": new StudioHttpError(503, "maintenance") });
  await r.m.check();
  await r.m.start({ orientation: "landscape" });
  assert.deepEqual([r.m.snapshot().phase, r.m.snapshot().reason], ["blocked", "maintenance"]);
});

test("Akhiri: engine berhenti, ping berhenti, fase ended(user)", async () => {
  let pings = 0;
  const r = machine({
    "GET /me/channel/broadcast": ready,
    "POST /me/channel/broadcast/start": { status: 200, data: { publishUrl: PUBLISH, profile: PROFILE } },
    "POST /me/channel/broadcast/ping": () => (++pings, { status: 200, data: { isLive: false, liveStartedAt: null } }),
  });
  await r.m.check();
  await r.m.start({ orientation: "landscape" });
  await r.m.end();
  assert.deepEqual([r.m.snapshot().phase, r.m.snapshot().reason], ["ended", "user"]);
  assert.equal(r.engine.log.at(-1).op, "stop");
  await r.c.advance(30000);
  assert.equal(pings, 0);
});
