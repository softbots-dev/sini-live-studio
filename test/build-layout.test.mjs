// Proses utama dibangun `tsc -p tsconfig.main.json` (allowJs). Berkas .mjs yang punya .d.mts di sebelahnya
// TIDAK disalin ke dist (tsc memakai deklarasinya) — aplikasi gagal menyala "Cannot find module". Deklarasi
// tipe untuk modul proses utama karena itu dilarang; tipe disimpulkan dari JS-nya.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("src/main & src/preload: tidak ada .d.mts di sebelah .mjs", () => {
  const files = [...walk(new URL("../src/main", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), ...walk(new URL("../src/preload", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))];
  const offenders = files.filter((f) => f.endsWith(".d.mts") && files.includes(f.replace(/\.d\.mts$/, ".mjs")));
  assert.deepEqual(offenders, []);
});

// Halaman widget (entri vite kedua) ikut build renderer dan memakai aset relatif — server widget menyajikan
// dist/renderer/widget.html + assets/. Dilewati kalau renderer belum pernah dibangun.
test("dist/renderer/widget.html ada, aset relatif, tanpa CSP renderer studio", { skip: !existsSync(new URL("../dist/renderer/index.html", import.meta.url)) && "renderer belum dibangun" }, () => {
  const html = readFileSync(new URL("../dist/renderer/widget.html", import.meta.url), "utf8");
  assert.match(html, /\.\/assets\//);
  assert.doesNotMatch(html, /connect-src 'none'/);
});
