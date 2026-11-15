// Geometri pratinjau (src/renderer/lib/transform.mjs): pegangan seperti OBS — 4 sudut + 4 sisi, sudut menjaga
// rasio (Shift = bebas), sisi meregangkan satu sumbu, sisi seberang tetap di tempat; Alt = potong (crop);
// preset menu klik kanan (pas/regangkan/tengahkan/atur ulang).
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemBox, hitTest, resizeItem, cropItem, presetTransform, CURSORS } from "../src/renderer/lib/transform.mjs";

const size = { width: 1000, height: 500 };
const base = { x: 100, y: 50, scaleX: 0.5, scaleY: 0.5, crop: { left: 0, right: 0, top: 0, bottom: 0 } };
const canvas = { width: 1920, height: 1080 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≉ ${b}`);

test("itemBox: ukuran tampil = (sumber − potongan) × skala", () => {
  assert.deepEqual(itemBox(base, size), { x: 100, y: 50, w: 500, h: 250 });
  assert.deepEqual(itemBox({ ...base, crop: { left: 100, right: 100, top: 0, bottom: 100 } }, size), { x: 100, y: 50, w: 400, h: 200 });
});

test("hitTest: 8 pegangan, badan, dan di luar", () => {
  const b = itemBox(base, size); // 100,50 — 600,300
  const tol = 10;
  assert.equal(hitTest(b, { x: 100, y: 50 }, tol), "nw");
  assert.equal(hitTest(b, { x: 605, y: 305 }, tol), "se");
  assert.equal(hitTest(b, { x: 600, y: 50 }, tol), "ne");
  assert.equal(hitTest(b, { x: 100, y: 300 }, tol), "sw");
  assert.equal(hitTest(b, { x: 350, y: 52 }, tol), "n");
  assert.equal(hitTest(b, { x: 350, y: 298 }, tol), "s");
  assert.equal(hitTest(b, { x: 98, y: 175 }, tol), "w");
  assert.equal(hitTest(b, { x: 602, y: 175 }, tol), "e");
  assert.equal(hitTest(b, { x: 350, y: 175 }, tol), "body");
  assert.equal(hitTest(b, { x: 700, y: 175 }, tol), null);
  for (const h of ["nw", "n", "ne", "e", "se", "s", "sw", "w", "body"]) assert.ok(CURSORS[h]);
});

test("resize sudut kanan bawah menjaga rasio; kiri atas tetap", () => {
  const p = resizeItem({ item: base, size, handle: "se", dx: 100, dy: 0, free: false });
  assert.equal(p.x, 100);
  assert.equal(p.y, 50);
  close(p.scaleX, 0.6);
  close(p.scaleY, 0.6);
});

test("resize sudut kiri atas: kanan bawah tetap di tempat", () => {
  const p = resizeItem({ item: base, size, handle: "nw", dx: -100, dy: -50, free: false });
  const b = itemBox({ ...base, ...p }, size);
  close(b.x + b.w, 600);
  close(b.y + b.h, 300);
  close(p.scaleX, p.scaleY);
  close(p.scaleX, 0.6);
});

test("resize sudut dengan Shift = bebas (dua sumbu terpisah)", () => {
  const p = resizeItem({ item: base, size, handle: "se", dx: 100, dy: 0, free: true });
  close(p.scaleX, 0.6);
  close(p.scaleY, 0.5);
});

test("resize sisi kiri meregangkan satu sumbu, sisi kanan tetap", () => {
  const p = resizeItem({ item: base, size, handle: "w", dx: 50, dy: 999, free: false });
  const b = itemBox({ ...base, ...p }, size);
  close(b.x + b.w, 600);
  close(p.scaleY, 0.5);
  close(b.w, 450);
  const s = resizeItem({ item: base, size, handle: "s", dx: 999, dy: -50, free: false });
  close(s.scaleX, 0.5);
  close(itemBox({ ...base, ...s }, size).h, 200);
  assert.equal(s.y, 50);
});

test("resize tidak pernah membalik / menjadi nol", () => {
  const p = resizeItem({ item: base, size, handle: "se", dx: -10000, dy: -10000, free: true });
  assert.ok(p.scaleX > 0 && p.scaleY > 0);
  const b = itemBox({ ...base, ...p }, size);
  assert.ok(b.w >= 1 && b.h >= 1);
  assert.equal(b.x, 100);
});

test("crop (Alt): sisi kiri dipotong, isi yang tersisa tidak bergeser", () => {
  const p = cropItem({ item: base, size, handle: "w", dx: 50, dy: 0 });
  // 50 px kanvas pada skala 0.5 = 100 px sumber
  assert.deepEqual(p.crop, { left: 100, right: 0, top: 0, bottom: 0 });
  assert.equal(p.x, 150);
  assert.equal(p.y, 50);
  const b = itemBox({ ...base, ...p }, size);
  close(b.x + b.w, 600);
});

test("crop sudut kanan bawah memotong dua sisi; tidak bisa negatif atau melebihi sumber", () => {
  const p = cropItem({ item: base, size, handle: "se", dx: -25, dy: -25 });
  assert.deepEqual(p.crop, { left: 0, right: 50, top: 0, bottom: 50 });
  assert.equal(p.x, 100);
  const back = cropItem({ item: base, size, handle: "e", dx: 500, dy: 0 });
  assert.equal(back.crop.right, 0);
  const all = cropItem({ item: base, size, handle: "w", dx: 10000, dy: 0 });
  assert.ok(all.crop.left <= size.width - 1);
});

test("preset: pas ke layar (rasio dijaga, di tengah), regangkan, tengahkan, atur ulang", () => {
  const fit = presetTransform("fit", base, size, canvas);
  close(fit.scaleX, 1.92);
  close(fit.scaleY, 1.92);
  assert.equal(fit.x, 0);
  assert.equal(fit.y, Math.round((1080 - 500 * 1.92) / 2));
  const stretch = presetTransform("stretch", base, size, canvas);
  assert.deepEqual([stretch.x, stretch.y], [0, 0]);
  close(stretch.scaleX, 1.92);
  close(stretch.scaleY, 2.16);
  const center = presetTransform("center", base, size, canvas);
  assert.deepEqual([center.x, center.y], [Math.round((1920 - 500) / 2), Math.round((1080 - 250) / 2)]);
  assert.equal(center.scaleX, undefined);
  assert.deepEqual(presetTransform("reset", base, size, canvas), { x: 0, y: 0, scaleX: 1, scaleY: 1, crop: { left: 0, right: 0, top: 0, bottom: 0 } });
});

test("preset pas ke layar memperhitungkan potongan", () => {
  const cropped = { ...base, crop: { left: 0, right: 500, top: 0, bottom: 0 } }; // 500×500 tersisa
  const fit = presetTransform("fit", cropped, size, canvas);
  close(fit.scaleX, 1080 / 500);
  assert.equal(fit.y, 0);
  assert.equal(fit.x, Math.round((1920 - 1080) / 2));
});

test("selectionFrame: bingkai dalam piksel CSS + garis jarak ke tepi kanvas (label piksel kanvas)", async () => {
  const { selectionFrame } = await import("../src/renderer/lib/transform.mjs");
  // Kanvas 1920×1080 tampil 960×540 mulai (20,10) di dalam elemen pratinjau → skala 0,5.
  const f = selectionFrame({ x: 100, y: 50, w: 500, h: 250 }, canvas, { x: 20, y: 10, width: 960, height: 540 });
  assert.deepEqual(f.box, { x: 70, y: 35, w: 250, h: 125 });
  const byLabel = Object.fromEntries(f.guides.map((g) => [g.side, g]));
  assert.equal(byLabel.left.label, 100);
  assert.deepEqual([byLabel.left.x1, byLabel.left.x2, byLabel.left.y1], [20, 70, 97.5]);
  assert.equal(byLabel.right.label, 1920 - 600);
  assert.equal(byLabel.right.x2, 980);
  assert.equal(byLabel.top.label, 50);
  assert.equal(byLabel.bottom.label, 1080 - 300);
  assert.equal(byLabel.bottom.y2, 550);
});

test("selectionFrame: tanpa garis untuk sisi yang menempel atau keluar kanvas", async () => {
  const { selectionFrame } = await import("../src/renderer/lib/transform.mjs");
  const f = selectionFrame({ x: 0, y: -20, w: 1920, h: 1200 }, canvas, { x: 0, y: 0, width: 960, height: 540 });
  assert.deepEqual(f.guides, []);
});

// ── Putar, cermin, preset posisi (tampilan baru) ─────────────────────────────
const { rotateItem, flipItem } = await import("../src/renderer/lib/transform.mjs");

test("itemBox rotasi 90: lebar & tinggi kotak tertukar", () => {
  assert.deepEqual(itemBox({ ...base, rotation: 90 }, size), { x: 100, y: 50, w: 250, h: 500 });
  assert.deepEqual(itemBox({ ...base, rotation: 180 }, size), { x: 100, y: 50, w: 500, h: 250 });
});

test("rotateItem: +90 searah jarum jam, pusat kotak tetap", () => {
  const p = rotateItem(base, size);
  assert.equal(p.rotation, 90);
  assert.equal(p.x, 225);
  assert.equal(p.y, -75);
  assert.equal(rotateItem({ ...base, rotation: 270 }, size).rotation, 0);
});

test("resize item berotasi 90: sisi kanan terlihat mengubah lebar terlihat (skala Y sumber)", () => {
  const item = { ...base, rotation: 90 };
  const p = resizeItem({ item, size, handle: "e", dx: 50, dy: 0, free: false });
  const b = itemBox({ ...item, ...p }, size);
  close(b.w, 300);
  close(b.h, 500);
  assert.equal(p.x, 100);
  close(p.scaleX, 0.5);
  close(p.scaleY, 0.6);
});

test("crop item berotasi 90: sisi atas terlihat = sisi kiri sumber; sisi bawah tetap", () => {
  const item = { ...base, rotation: 90 };
  const p = cropItem({ item, size, handle: "n", dy: 50, dx: 0 });
  assert.deepEqual(p.crop, { left: 100, right: 0, top: 0, bottom: 0 });
  const b = itemBox({ ...item, ...p }, size);
  close(b.y + b.h, 50 + 500);
  close(b.y, 100);
});

test("crop item bercermin horizontal: sisi kiri terlihat = sisi kanan sumber", () => {
  const item = { ...base, flipH: true };
  const p = cropItem({ item, size, handle: "w", dx: 50, dy: 0 });
  assert.deepEqual(p.crop, { left: 0, right: 100, top: 0, bottom: 0 });
  close(itemBox({ ...item, ...p }, size).x + itemBox({ ...item, ...p }, size).w, 600);
});

test("flipItem membalik bendera tanpa menggeser kotak", () => {
  assert.deepEqual(flipItem(base, "h"), { flipH: true });
  assert.deepEqual(flipItem({ ...base, flipV: true }, "v"), { flipV: false });
});

test("preset posisi: rata kiri/kanan/atas/bawah dan tengah satu sumbu", () => {
  assert.deepEqual(presetTransform("left", base, size, canvas), { x: 0 });
  assert.deepEqual(presetTransform("right", base, size, canvas), { x: 1920 - 500 });
  assert.deepEqual(presetTransform("top", base, size, canvas), { y: 0 });
  assert.deepEqual(presetTransform("bottom", base, size, canvas), { y: 1080 - 250 });
  assert.deepEqual(presetTransform("centerH", base, size, canvas), { x: 710 });
  assert.deepEqual(presetTransform("centerV", base, size, canvas), { y: 415 });
  const rotated = presetTransform("fit", { ...base, rotation: 90 }, size, canvas);
  close(rotated.scaleX, 1080 / 1000); // 90°: tinggi terlihat = lebar sumber
});
