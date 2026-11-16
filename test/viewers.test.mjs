// Tab Penonton di Sini Live Studio (src/main/viewers.mjs): `room.viewers` dari gateway → daftar untuk renderer,
// foto penonton diunduh proses utama sebagai thumbnail kecil (CSP renderer hanya data:), di-cache, paralel terbatas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { avatarThumb, createViewers } from "../src/main/viewers.mjs";

const KEY = "2026/11/0f8b8f5e-1c2d-4e3f-9a0b-123456789abc.webp";
const person = (id, patch = {}) => ({ id, username: `user_${id}`, displayName: `User ${id}`, avatarUrl: "", color: "#f0a", badges: [], ...patch });
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness({ send = true, avatars = {}, concurrency } = {}) {
  const requests = [];
  const loads = [];
  const changes = [];
  const pending = new Map();
  const v = createViewers({
    request: () => {
      requests.push(1);
      return send;
    },
    loadAvatar: (url) => {
      loads.push(url);
      if (url in avatars) return Promise.resolve(avatars[url]);
      return new Promise((resolve) => pending.set(url, resolve));
    },
    onChange: () => changes.push(v.snapshot()),
    ...(concurrency ? { concurrency } : {}),
  });
  return { v, requests, loads, changes, pending };
}

test("avatarThumb: unggahan berkunci → thumbnail 96 px; tautan luar & kosong apa adanya", () => {
  assert.equal(avatarThumb(`/v1/media/${KEY}`), `/v1/media/thumb/96/${KEY}`);
  assert.equal(avatarThumb(`https://cdn.example.com/media/${KEY}?v=2`), `/v1/media/thumb/96/${KEY}`);
  assert.equal(avatarThumb("https://lh3.googleusercontent.com/a/abc=s96-c"), "https://lh3.googleusercontent.com/a/abc=s96-c");
  assert.equal(avatarThumb(""), null);
  assert.equal(avatarThumb(null), null);
});

test("awal: idle tanpa penonton; refresh mengirim room.viewers dan menandai loading", () => {
  const h = harness();
  assert.deepEqual(h.v.snapshot(), { status: "idle", total: 0, more: 0, viewers: [] });
  assert.equal(h.v.refresh(), true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.v.snapshot().status, "loading");
});

test("refresh tanpa soket: tidak menandai loading (renderer menampilkan menyambungkan)", () => {
  const h = harness({ send: false });
  assert.equal(h.v.refresh(), false);
  assert.equal(h.v.snapshot().status, "idle");
});

test("room.viewers → daftar siap, urutan server dipertahankan, total & more diteruskan", () => {
  const h = harness();
  h.v.refresh();
  h.v.apply({ type: "room.viewers", data: { total: 302, more: 300, viewers: [person("b", { badges: ["moderator"] }), person("a")] } });
  const s = h.v.snapshot();
  assert.equal(s.status, "ready");
  assert.equal(s.total, 302);
  assert.equal(s.more, 300);
  assert.deepEqual(
    s.viewers.map((x) => [x.id, x.username, x.displayName, x.color, x.badges, x.avatar]),
    [
      ["b", "user_b", "User b", "#f0a", ["moderator"], null],
      ["a", "user_a", "User a", "#f0a", [], null],
    ],
  );
  assert.ok(h.changes.length >= 1);
});

test("data rusak dari gateway diabaikan per baris, bukan seluruh daftar", () => {
  const h = harness();
  h.v.apply({ type: "room.viewers", data: { total: 3, more: -4, viewers: [person("a"), { id: 5 }, null, person("c", { badges: "x" })] } });
  const s = h.v.snapshot();
  assert.deepEqual(s.viewers.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(s.viewers[1].badges, []);
  assert.equal(s.more, 0);
  h.v.apply({ type: "room.viewers", data: null });
  assert.deepEqual(h.v.snapshot().viewers.map((x) => x.id), ["a", "c"]);
});

test("foto: thumbnail diunduh sekali per alamat, hasilnya menempel di baris & di-cache untuk refresh berikutnya", async () => {
  const url = `/v1/media/${KEY}`;
  const h = harness({ avatars: { [`/v1/media/thumb/96/${KEY}`]: "data:image/webp;base64,AAA" } });
  h.v.apply({ type: "room.viewers", data: { total: 1, more: 0, viewers: [person("a", { avatarUrl: url })] } });
  await flush();
  assert.equal(h.v.snapshot().viewers[0].avatar, "data:image/webp;base64,AAA");
  h.v.apply({ type: "room.viewers", data: { total: 2, more: 0, viewers: [person("a", { avatarUrl: url }), person("b", { avatarUrl: url })] } });
  await flush();
  assert.deepEqual(h.loads, [`/v1/media/thumb/96/${KEY}`]);
  assert.deepEqual(h.v.snapshot().viewers.map((x) => x.avatar), ["data:image/webp;base64,AAA", "data:image/webp;base64,AAA"]);
});

test("foto gagal → avatar null (huruf awal), tidak diunduh ulang setiap refresh", async () => {
  const h = harness({ avatars: { "https://x.test/a.png": null } });
  const list = { total: 1, more: 0, viewers: [person("a", { avatarUrl: "https://x.test/a.png" })] };
  h.v.apply({ type: "room.viewers", data: list });
  await flush();
  h.v.apply({ type: "room.viewers", data: list });
  await flush();
  assert.equal(h.loads.length, 1);
  assert.equal(h.v.snapshot().viewers[0].avatar, null);
});

test("unduhan foto paralel terbatas (bawaan 4), sisanya antre", async () => {
  const h = harness();
  const rows = Array.from({ length: 10 }, (_, i) => person(String(i), { avatarUrl: `https://x.test/${i}.png` }));
  h.v.apply({ type: "room.viewers", data: { total: 10, more: 0, viewers: rows } });
  await flush();
  assert.equal(h.loads.length, 4);
  h.pending.get("https://x.test/0.png")("data:image/png;base64,B");
  await flush();
  await flush();
  assert.equal(h.loads.length, 5);
  assert.equal(h.v.snapshot().viewers[0].avatar, "data:image/png;base64,B");
});

test("reset (keluar / ganti channel): daftar kosong lagi, foto yang telat datang tidak menghidupkannya", async () => {
  const h = harness();
  h.v.apply({ type: "room.viewers", data: { total: 1, more: 0, viewers: [person("a", { avatarUrl: "https://x.test/a.png" })] } });
  await flush();
  h.v.reset();
  assert.deepEqual(h.v.snapshot(), { status: "idle", total: 0, more: 0, viewers: [] });
  h.pending.get("https://x.test/a.png")("data:image/png;base64,C");
  await flush();
  assert.deepEqual(h.v.snapshot().viewers, []);
});

test("pesan lain dari gateway tidak mengubah daftar", () => {
  const h = harness();
  h.v.apply({ type: "chat.message", data: { id: "m" } });
  assert.equal(h.changes.length, 0);
  assert.equal(h.v.snapshot().status, "idle");
});
