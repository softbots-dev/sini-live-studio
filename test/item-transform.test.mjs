// Model item → transform OBS (src/main/engine/item-transform.mjs). Item tanpa putar/cermin: acuan kiri atas
// (tidak bergantung ukuran sumber). Diputar/dicermin: acuan TENGAH di pusat kotak terlihat, skala negatif = cermin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { obsTransform } from "../src/main/engine/item-transform.mjs";

const size = { width: 1000, height: 500 };
const base = { x: 100, y: 50, scaleX: 0.5, scaleY: 0.5 };

test("tanpa putar/cermin: acuan kiri atas, posisi = x,y", () => {
  const t = obsTransform(base, size);
  assert.equal(t.alignment, "topLeft");
  assert.deepEqual(t.position, { x: 100, y: 50 });
  assert.deepEqual(t.scale, { x: 0.5, y: 0.5 });
  assert.equal(t.rotation, 0);
});

test("cermin horizontal: acuan tengah, skala x negatif, posisi = pusat kotak", () => {
  const t = obsTransform({ ...base, flipH: true }, size);
  assert.equal(t.alignment, "center");
  assert.deepEqual(t.position, { x: 350, y: 175 });
  assert.deepEqual(t.scale, { x: -0.5, y: 0.5 });
});

test("putar 90: pusat kotak terlihat (lebar & tinggi tertukar)", () => {
  const t = obsTransform({ ...base, x: 225, y: -75, rotation: 90 }, size);
  assert.equal(t.rotation, 90);
  assert.deepEqual(t.position, { x: 350, y: 175 });
});

test("potongan mengecilkan kotak sebelum pusat dihitung", () => {
  const t = obsTransform({ ...base, flipV: true, crop: { left: 200, right: 0, top: 0, bottom: 100 } }, size);
  assert.deepEqual(t.position, { x: 100 + 200, y: 50 + 100 });
  assert.deepEqual(t.crop, { left: 200, right: 0, top: 0, bottom: 100 });
});
