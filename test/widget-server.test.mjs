// Server widget lokal (src/main/widgets/server.mjs): hanya 127.0.0.1, token di path, Host wajib cocok,
// berkas hanya widget.html + assets/, aliran SSE dari hub. Server sungguhan di port acak.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { createWidgetServer } from "../src/main/widgets/server.mjs";

let dir;
let server;
let port;
const TOKEN = "a".repeat(32);
const unsubscribed = [];
const hub = {
  subscribe(id, send) {
    send("config", { type: "counter", id });
    return () => unsubscribed.push(id);
  },
};

before(async () => {
  const root = mkdtempSync(join(tmpdir(), "sini-widget-"));
  dir = join(root, "renderer");
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "widget.html"), "<!doctype html><title>w</title>");
  writeFileSync(join(dir, "assets", "a.js"), "console.log(1)");
  writeFileSync(join(dir, "index.html"), "studio");
  writeFileSync(join(root, "rahasia.txt"), "rahasia");
  server = createWidgetServer({ hub, staticDir: dir, origin: "https://sini.test", token: TOKEN });
  port = await server.start();
});
after(async () => {
  await server.stop();
  rmSync(join(dir, ".."), { recursive: true, force: true });
});

function get(path, { host, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method, headers: { host: host ?? `127.0.0.1:${port}` } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("urlFor memakai 127.0.0.1, port, token, id & jenis", () => {
  assert.equal(server.urlFor("src-1", "alert"), `http://127.0.0.1:${port}/w/${TOKEN}/widget.html?id=src-1&type=alert`);
});

test("widget.html & assets disajikan dengan CSP dan tanpa cache", async () => {
  const page = await get(`/w/${TOKEN}/widget.html?id=x&type=counter`);
  assert.equal(page.status, 200);
  assert.match(page.headers["content-type"], /text\/html/);
  assert.match(page.headers["content-security-policy"], /connect-src 'self'/);
  assert.match(page.headers["content-security-policy"], /img-src 'self' https: https:\/\/sini\.test/);
  assert.equal(page.headers["cache-control"], "no-store");
  const js = await get(`/w/${TOKEN}/assets/a.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers["content-type"], /javascript/);
});

test("yang lain 404: token salah, Host lain, path traversal, berkas di luar widget, POST", async () => {
  for (const path of [`/w/${"b".repeat(32)}/widget.html`, `/w/${TOKEN}/../rahasia.txt`, `/w/${TOKEN}/%2e%2e/rahasia.txt`, `/w/${TOKEN}/assets/%2e%2e/%2e%2e/rahasia.txt`, `/w/${TOKEN}/index.html`, "/", `/w/${TOKEN}/`]) {
    const r = await get(path);
    assert.equal(r.status, 404, path);
    assert.equal(r.body, "");
  }
  assert.equal((await get(`/w/${TOKEN}/widget.html`, { host: `localhost:${port}` })).status, 404);
  assert.equal((await get(`/w/${TOKEN}/widget.html`, { method: "POST" })).status, 404);
});

test("events: SSE dari hub; koneksi ditutup → unsubscribe", async () => {
  const data = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: `/w/${TOKEN}/events?id=src-9`, headers: { host: `127.0.0.1:${port}` } }, (res) => {
      assert.equal(res.statusCode, 200);
      assert.match(res.headers["content-type"], /text\/event-stream/);
      let buf = "";
      res.on("data", (c) => {
        buf += c;
        if (/event: config[^]*?\n\n/.test(buf)) {
          req.destroy();
          resolve(buf);
        }
      });
    });
    req.on("error", (e) => (e.code === "ECONNRESET" ? null : reject(e)));
    req.end();
  });
  assert.match(data, /event: config\ndata: \{"type":"counter","id":"src-9"\}\n\n/);
  for (let i = 0; i < 50 && !unsubscribed.includes("src-9"); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(unsubscribed.includes("src-9"));
});
