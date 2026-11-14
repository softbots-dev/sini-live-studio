// Alur sambungan lewat browser (src/main/link.mjs, kontrak docs/live-studio.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCode, linkUrl, runLink } from "../src/main/link.mjs";
import { StudioHttpError } from "../src/main/http.mjs";

const LINK = { status: 201, data: { linkId: "11111111-2222-4333-8444-555555555555", code: "ABCDEFGH", pollToken: "p".repeat(43), expiresIn: 600, interval: 2 } };

function http(tokenReplies) {
  const calls = [];
  return {
    origin: "https://sini.live",
    calls,
    post: async (path, body) => {
      calls.push({ path, body });
      if (path === "/studio/link") return LINK;
      const r = tokenReplies.shift();
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

test("tautan & kode", () => {
  assert.equal(formatCode("ABCDEFGH"), "ABCD-EFGH");
  assert.equal(linkUrl("https://sini.live", "en", "abc"), "https://sini.live/en/studio/link/abc/");
});

test("menunggu → disetujui → linked; browser dibuka ke halaman setujui", async () => {
  const opened = [];
  const codes = [];
  const sleeps = [];
  const h = http([{ status: 202, data: { status: "pending" } }, new StudioHttpError(429, "slow_down", 2000), { status: 200, data: { id: "u1" } }]);
  const out = await runLink({ http: h, locale: "id", openExternal: (u) => opened.push(u), onCode: (c) => codes.push(c), sleep: async (ms) => sleeps.push(ms) });
  assert.equal(out, "linked");
  assert.deepEqual(opened, ["https://sini.live/id/studio/link/11111111-2222-4333-8444-555555555555/"]);
  assert.deepEqual(codes, ["ABCD-EFGH"]);
  assert.deepEqual(h.calls[0].body, { platform: "windows" });
  assert.ok(h.calls.slice(1).every((c) => c.path === "/studio/link/token" && c.body.pollToken === LINK.data.pollToken));
  assert.deepEqual(sleeps, [2000, 2000, 2000, 2000]);
});

test("410 → expired; dibatalkan → cancelled", async () => {
  assert.equal(await runLink({ http: http([new StudioHttpError(410, "link_expired")]), locale: "en", openExternal: () => {}, onCode: () => {}, sleep: async () => {} }), "expired");
  const ctl = new AbortController();
  const out = await runLink({ http: http([{ status: 202, data: { status: "pending" } }]), locale: "en", openExternal: () => {}, onCode: () => {}, sleep: async () => ctl.abort(), signal: ctl.signal });
  assert.equal(out, "cancelled");
});

test("siteLocale: bahasa Windows → bahasa situs Sini", async () => {
  const { siteLocale } = await import("../src/main/link.mjs");
  assert.equal(siteLocale("id"), "id");
  assert.equal(siteLocale("en-US"), "en");
  assert.equal(siteLocale("pt-BR"), "pt-br");
  assert.equal(siteLocale("zh-TW"), "zh-tw");
  assert.equal(siteLocale("zh-CN"), "zh-cn");
  assert.equal(siteLocale("fil-PH"), "fil");
  assert.equal(siteLocale("sw"), "en");
});
