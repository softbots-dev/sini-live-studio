// Klien HTTP proses utama (src/main/http.mjs): Origin & User-Agent seperti aplikasi Android, cookie jar
// sendiri, refresh sekali saat 401 lalu ulang (CLAUDE.md §4.26), galat hanya {status, code}.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCookieJar, createHttp, StudioHttpError } from "../src/main/http.mjs";

function res(status, body, cookies = [], headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { getSetCookie: () => cookies, get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  };
}

test("header Origin, User-Agent, cookie; jawaban 2xx → {status, data}", async () => {
  const seen = [];
  const jar = createCookieJar();
  jar.store(["sini_at=a1; Path=/; HttpOnly", "sini_rt=r1; Path=/v1/auth; HttpOnly"]);
  const http = createHttp({ origin: "https://sini.live", version: "1.2.3", jar, fetch: async (url, init) => (seen.push({ url, init }), res(202, { ok: true, data: { status: "pending" } })) });
  const out = await http.post("/studio/link/token", { pollToken: "x" });
  assert.deepEqual(out, { status: 202, data: { status: "pending" } });
  assert.equal(seen[0].url, "https://sini.live/v1/studio/link/token");
  assert.equal(seen[0].init.headers.origin, "https://sini.live");
  assert.equal(seen[0].init.headers["user-agent"], "SiniLiveStudio/1.2.3 (Windows)");
  assert.equal(seen[0].init.headers.cookie, "sini_at=a1; sini_rt=r1");
  assert.equal(seen[0].init.body, JSON.stringify({ pollToken: "x" }));
});

test("cookie jar menyimpan Set-Cookie dan menghapus yang Max-Age=0", () => {
  const jar = createCookieJar();
  jar.store(["a=1; Path=/", "b=2; Path=/"]);
  jar.store(["a=; Max-Age=0; Path=/"]);
  assert.equal(jar.header(), "b=2");
  assert.deepEqual(jar.toJSON(), { b: "2" });
  const again = createCookieJar({ b: "2" });
  assert.equal(again.header(), "b=2");
});

test("401 → refresh sekali lalu ulang", async () => {
  const urls = [];
  let first = true;
  const jar = createCookieJar({ sini_rt: "r1" });
  const http = createHttp({
    origin: "https://sini.live",
    version: "1.0.0",
    jar,
    fetch: async (url) => {
      urls.push(url);
      if (url.endsWith("/v1/auth/refresh")) return res(200, { ok: true }, ["sini_at=baru; Path=/"]);
      if (first) {
        first = false;
        return res(401, { ok: false, code: "login_required" });
      }
      return res(200, { ok: true, data: { x: 1 } });
    },
  });
  assert.deepEqual(await http.get("/me/channel/broadcast"), { status: 200, data: { x: 1 } });
  assert.deepEqual(urls.map((u) => u.replace("https://sini.live", "")), ["/v1/me/channel/broadcast", "/v1/auth/refresh", "/v1/me/channel/broadcast"]);
  assert.match(jar.header(), /sini_at=baru/);
});

test("refresh gagal → StudioHttpError 401 login_required; galat lain membawa kode & Retry-After", async () => {
  const http = createHttp({
    origin: "https://sini.live",
    version: "1.0.0",
    jar: createCookieJar(),
    fetch: async (url) => (url.endsWith("/refresh") ? res(401, { ok: false, code: "unauthenticated" }) : res(401, { ok: false, code: "unauthenticated" })),
  });
  await assert.rejects(http.get("/me"), (err) => err instanceof StudioHttpError && err.status === 401 && err.code === "login_required");

  const limited = createHttp({ origin: "https://sini.live", version: "1.0.0", jar: createCookieJar(), fetch: async () => res(429, { ok: false, code: "slow_down" }, [], { "retry-after": "2" }) });
  await assert.rejects(limited.post("/studio/link/token", {}), (err) => err.status === 429 && err.code === "slow_down" && err.retryAfterMs === 2000);

  const down = createHttp({ origin: "https://sini.live", version: "1.0.0", jar: createCookieJar(), fetch: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(down.get("/me"), (err) => err.status === 0 && err.code === "network");
});
