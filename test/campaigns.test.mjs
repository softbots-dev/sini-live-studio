// Campaign di Sini Live Studio (src/main/campaigns.mjs): daftar dari API, gambar diunduh proses utama jadi
// data: URL (gagal/besar/bukan gambar → dilewati), × disimpan, tautan hanya dibuka proses utama (https).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCampaigns, downloadImage, MAX_IMAGE_BYTES } from "../src/main/campaigns.mjs";

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const row = (id, patch = {}) => ({ id, title: `Campaign ${id}`, imageUrl: `/v1/media/${id}.webp`, linkUrl: `https://sini.live/id/news/${id}/`, ...patch });

function harness({ rows = [row("a"), row("b")], images = {}, dismissed = [] } = {}) {
  const calls = { get: [], image: [], opened: [], saved: [] };
  const states = [];
  let fail = null;
  let list = rows;
  let saved = dismissed;
  const c = createCampaigns({
    http: {
      origin: "https://sini.live",
      get: async (p) => {
        calls.get.push(p);
        if (fail) throw fail;
        return { status: 200, data: list };
      },
    },
    fetchImage: async (url) => {
      calls.image.push(url);
      const img = images[url];
      if (img instanceof Error) throw img;
      return img ?? { contentType: "image/png", bytes: PNG };
    },
    getLocale: () => "pt-br",
    getDismissed: () => saved,
    setDismissed: (ids) => {
      saved = ids;
      calls.saved.push(ids);
    },
    onState: (s) => states.push(s),
    openExternal: (u) => calls.opened.push(u),
  });
  return { c, calls, states, setFail: (e) => (fail = e), setRows: (r) => (list = r), saved: () => saved };
}

test("refresh: daftar untuk bahasa studio, gambar jadi data: URL, renderer tidak menerima tautan", async () => {
  const h = harness({ rows: [row("a"), row("b", { linkUrl: "", imageUrl: "https://cdn.contoh.id/b.png" })] });
  const state = await h.c.refresh();
  assert.deepEqual(h.calls.get, ["/studio/campaigns?locale=pt-br"]);
  assert.deepEqual(h.calls.image, ["https://sini.live/v1/media/a.webp", "https://cdn.contoh.id/b.png"]);
  assert.equal(state.length, 2);
  assert.deepEqual(Object.keys(state[0]).sort(), ["hasLink", "id", "image", "title"]);
  assert.equal(state[0].image, `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
  assert.equal(state[0].hasLink, true);
  assert.equal(state[1].hasLink, false);
  assert.deepEqual(h.states.at(-1), state);
});

test("gambar gagal, bukan gambar, SVG, atau terlalu besar → campaign itu dilewati", async () => {
  const big = { contentType: "image/png", bytes: new Uint8Array(MAX_IMAGE_BYTES + 1) };
  const h = harness({
    rows: [row("ok"), row("err"), row("html"), row("svg"), row("big")],
    images: {
      "https://sini.live/v1/media/err.webp": new Error("network"),
      "https://sini.live/v1/media/html.webp": { contentType: "text/html", bytes: PNG },
      "https://sini.live/v1/media/svg.webp": { contentType: "image/svg+xml", bytes: PNG },
      "https://sini.live/v1/media/big.webp": big,
    },
  });
  assert.deepEqual((await h.c.refresh()).map((s) => s.id), ["ok"]);
});

test("alamat gambar selain http(s) atau relatif tidak diunduh", async () => {
  const h = harness({ rows: [row("a", { imageUrl: "file:///C:/rahasia.png" }), row("b", { imageUrl: "//evil.example/x.png" })] });
  assert.deepEqual(await h.c.refresh(), []);
  assert.deepEqual(h.calls.image, []);
});

test("gambar yang sama tidak diunduh ulang", async () => {
  const h = harness();
  await h.c.refresh();
  await h.c.refresh();
  assert.equal(h.calls.image.length, 2);
});

test("galat jaringan: keadaan terakhir dipertahankan", async () => {
  const h = harness();
  await h.c.refresh();
  h.setFail(Object.assign(new Error("network"), { status: 0, code: "network" }));
  assert.equal((await h.c.refresh()).length, 2);
});

test("dismiss menyaring & menyimpan (maks. 100, id tak dikenal diabaikan)", async () => {
  const h = harness({ dismissed: Array.from({ length: 100 }, (_, i) => `lama-${i}`) });
  await h.c.refresh();
  h.c.dismiss("b");
  h.c.dismiss("tidak-ada");
  assert.deepEqual(h.states.at(-1).map((s) => s.id), ["a"]);
  assert.equal(h.saved().length, 100);
  assert.equal(h.saved().at(-1), "b");
  assert.equal(h.saved().includes("lama-0"), false);
  assert.equal(h.calls.saved.length, 1);
});

test("open hanya membuka tautan https milik campaign yang dikenal", async () => {
  const h = harness({ rows: [row("a"), row("b", { linkUrl: "" }), row("c", { linkUrl: "http://contoh.id" })] });
  await h.c.refresh();
  assert.equal(h.c.open("a"), true);
  assert.equal(h.c.open("b"), false);
  assert.equal(h.c.open("c"), false);
  assert.equal(h.c.open("zzz"), false);
  assert.deepEqual(h.calls.opened, ["https://sini.live/id/news/a/"]);
});

test("stop mengosongkan keadaan; jawaban lama yang datang belakangan dibuang", async () => {
  const h = harness();
  const pending = h.c.refresh();
  h.c.stop();
  await pending;
  assert.deepEqual(h.c.state(), []);
  assert.deepEqual(h.states.at(-1), []);
});

test("downloadImage: menolak status gagal, jenis salah, dan ukuran berlebih dari header", async () => {
  const res = (status, type, body, len) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (k === "content-type" ? type : k === "content-length" ? len ?? null : null) },
    arrayBuffer: async () => body.buffer,
  });
  const ok = await downloadImage("https://x/a.png", async () => res(200, "image/webp; charset=binary", PNG));
  assert.equal(ok.contentType, "image/webp");
  assert.equal(ok.bytes.length, PNG.length);
  await assert.rejects(downloadImage("https://x/a.png", async () => res(404, "image/png", PNG)));
  await assert.rejects(downloadImage("https://x/a.png", async () => res(200, "image/png", PNG, String(MAX_IMAGE_BYTES + 1))));
});
