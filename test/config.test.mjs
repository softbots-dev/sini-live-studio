// Origin web Sini: build terpasang selalu https://sini.live; SINI_WEB_ORIGIN hanya untuk pengembangan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { webOrigin } from "../src/main/config.mjs";

test("webOrigin", () => {
  assert.equal(webOrigin({ packaged: true, env: { SINI_WEB_ORIGIN: "http://localhost:3500" } }), "https://sini.live");
  assert.equal(webOrigin({ packaged: false, env: {} }), "https://sini.live");
  assert.equal(webOrigin({ packaged: false, env: { SINI_WEB_ORIGIN: "http://localhost:3500/" } }), "http://localhost:3500");
  assert.equal(webOrigin({ packaged: false, env: { SINI_WEB_ORIGIN: "javascript:alert(1)" } }), "https://sini.live");
});
