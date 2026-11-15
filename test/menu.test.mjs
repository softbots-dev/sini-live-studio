// Menu klik kanan native (src/main/menu.mjs): entri dari renderer disaring jadi templat Electron — hanya label
// teks, id, centang, nonaktif, pemisah, satu tingkat submenu; klik memanggil onPick(id).
import { test } from "node:test";
import assert from "node:assert/strict";
import { menuTemplate } from "../src/main/menu.mjs";

test("templat: label, id, centang, nonaktif, pemisah, submenu; klik → onPick(id)", () => {
  const picked = [];
  const tpl = menuTemplate(
    [
      { id: "hide", label: "Sembunyikan" },
      { type: "separator" },
      { id: "lock", label: "Kunci", checked: true },
      { id: "up", label: "Naik", enabled: false },
      { label: "Urutan", submenu: [{ id: "top", label: "Paling atas" }] },
    ],
    (id) => picked.push(id),
  );
  assert.equal(tpl.length, 5);
  assert.equal(tpl[1].type, "separator");
  assert.equal(tpl[2].type, "checkbox");
  assert.equal(tpl[2].checked, true);
  assert.equal(tpl[3].enabled, false);
  tpl[0].click();
  tpl[4].submenu[0].click();
  assert.deepEqual(picked, ["hide", "top"]);
});

test("masukan aneh disaring: bukan larik, label bukan teks, submenu bersarang terlalu dalam, terlalu banyak", () => {
  assert.deepEqual(menuTemplate(null, () => {}), []);
  const tpl = menuTemplate(
    [
      { id: "x", label: { evil: true } },
      { id: "role", label: "Keluar", role: "quit" },
      { label: "A", submenu: [{ label: "B", submenu: [{ id: "deep", label: "C" }] }] },
      ...Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })),
    ],
    () => {},
  );
  assert.ok(tpl.length <= 40);
  assert.equal(tpl[0].label, "");
  assert.equal(tpl[1].role, undefined);
  assert.equal(tpl[2].submenu[0].submenu, undefined);
});
