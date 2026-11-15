// Pengaturan widget (src/main/widgets/config.mjs): jenis & batas dijepit sebelum disimpan atau dipakai.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWidget, WIDGET_KIND, WIDGET_SIZES, WIDGET_TYPES } from "../src/main/widgets/config.mjs";

test("jenis & ukuran bawaan", () => {
  assert.equal(WIDGET_KIND, "sini_widget");
  assert.deepEqual(WIDGET_TYPES, ["alert", "goal", "counter", "countdown", "ranking", "chatbox"]);
  assert.deepEqual(WIDGET_SIZES.alert, { width: 800, height: 300 });
  assert.deepEqual(WIDGET_SIZES.chatbox, { width: 500, height: 700 });
});

test("alert dijepit 3–15 dtk, gift minimum ≥ 1, suara bawaan aktif", () => {
  assert.deepEqual(normalizeWidget({ widget: "alert", durationSec: 99, minCoins: 0 }), { widget: "alert", durationSec: 15, minCoins: 1, sound: true });
  assert.deepEqual(normalizeWidget({ widget: "alert" }), { widget: "alert", durationSec: 5, minCoins: 1, sound: true });
  assert.equal(normalizeWidget({ widget: "alert", durationSec: 1, sound: false }).durationSec, 3);
  assert.equal(normalizeWidget({ widget: "alert", sound: false }).sound, false);
});

test("ranking 3–10, chatbox 3–15 & ukuran huruf", () => {
  assert.equal(normalizeWidget({ widget: "ranking", rows: 1 }).rows, 3);
  assert.equal(normalizeWidget({ widget: "ranking", rows: 50 }).rows, 10);
  assert.deepEqual(normalizeWidget({ widget: "ranking" }), { widget: "ranking", title: "", rows: 5 });
  assert.deepEqual(normalizeWidget({ widget: "chatbox", fontSize: "huge", rows: 99 }), { widget: "chatbox", fontSize: "medium", rows: 15, showEvents: true });
  assert.equal(normalizeWidget({ widget: "chatbox", fontSize: "large", showEvents: false }).showEvents, false);
});

test("jenis tak dikenal → penghitung; goal target > 0 & jenis target dikenal", () => {
  assert.deepEqual(normalizeWidget({ widget: "nope" }), { widget: "counter", title: "", value: 0 });
  assert.deepEqual(normalizeWidget({ widget: "goal", target: -5, goal: "diamonds" }), { widget: "goal", goal: "coins", target: 1, title: "" });
  assert.equal(normalizeWidget({ widget: "goal", target: 12.7, goal: "members" }).target, 12);
  assert.equal(normalizeWidget({ widget: "goal", goal: "followers" }).target, 100);
  assert.equal(normalizeWidget(null).widget, "counter");
});

test("hitung mundur 1 dtk – 24 jam; penghitung bilangan bulat; judul ≤ 60", () => {
  assert.equal(normalizeWidget({ widget: "countdown", durationSec: 999999 }).durationSec, 86400);
  assert.equal(normalizeWidget({ widget: "countdown", durationSec: 0 }).durationSec, 1);
  assert.equal(normalizeWidget({ widget: "countdown" }).durationSec, 300);
  assert.equal(normalizeWidget({ widget: "counter", value: 3.9 }).value, 3);
  assert.equal(normalizeWidget({ widget: "counter", value: "x" }).value, 0);
  assert.equal(normalizeWidget({ widget: "counter", title: "a".repeat(100) }).title.length, 60);
  assert.equal(normalizeWidget({ widget: "counter", title: 5 }).title, "");
});
