// Penjaga keluar & pembaruan (src/main/quit-guard.mjs): tidak menutup diam-diam dan tidak memasang
// pembaruan selama siaran aktif.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canQuit, mayInstallUpdate } from "../src/main/quit-guard.mjs";

const ALL = ["idle", "checking", "ready", "blocked", "starting", "connecting", "live", "reconnecting", "ended", "failed"];
const ACTIVE = new Set(["starting", "connecting", "live", "reconnecting"]);

test("canQuit & mayInstallUpdate per fase", () => {
  for (const phase of ALL) {
    assert.equal(canQuit(phase), !ACTIVE.has(phase), phase);
    assert.equal(mayInstallUpdate(phase), !ACTIVE.has(phase), phase);
  }
  assert.equal(canQuit(undefined), true);
});
