/*
  Server widget lokal: menyajikan halaman widget (dist/renderer/widget.html + assets/) dan aliran event (SSE)
  ke sumber browser OBS. Hanya 127.0.0.1, token 128-bit per proses di path, header Host wajib persis
  `127.0.0.1:<port>` (penangkal DNS rebinding), hanya GET. Selain itu 404 tanpa isi. Alamatnya tidak pernah
  disimpan — dibuat ulang tiap studio jalan.
*/
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };
const ASSET = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
const KEEPALIVE_MS = 15_000;

export function createWidgetServer({ hub, staticDir, origin, token = randomBytes(16).toString("hex") }) {
  let server = null;
  let port = 0;
  const streams = new Set();
  const csp = `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' https: ${origin}; media-src 'self' https: ${origin}`;

  const notFound = (res) => {
    res.writeHead(404, { "content-length": "0" });
    res.end();
  };

  /** Segmen path yang sudah di-decode, atau null kalau ada yang mencurigakan. */
  function segments(rawPath) {
    const out = [];
    for (const part of rawPath.split("/").slice(1)) {
      let s;
      try {
        s = decodeURIComponent(part);
      } catch {
        return null;
      }
      if (s === "." || s === ".." || /[\\/\0]/.test(s)) return null;
      out.push(s);
    }
    return out;
  }

  async function sendFile(res, rel) {
    const ext = rel.slice(rel.lastIndexOf("."));
    const type = TYPES[ext];
    if (!type) return notFound(res);
    let body;
    try {
      body = await readFile(join(staticDir, ...rel.split("/")));
    } catch {
      return notFound(res);
    }
    res.writeHead(200, { "content-type": type, "content-length": body.length, "cache-control": "no-store", "content-security-policy": csp, "x-content-type-options": "nosniff" });
    res.end(body);
  }

  function events(req, res, id) {
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
    res.write(": ok\n\n");
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const unsubscribe = hub.subscribe(id, send);
    const ping = setInterval(() => res.write(": ping\n\n"), KEEPALIVE_MS);
    const entry = { res, close: () => {} };
    entry.close = () => {
      clearInterval(ping);
      unsubscribe();
      streams.delete(entry);
    };
    streams.add(entry);
    req.on("close", entry.close);
    res.on("error", entry.close);
  }

  function handle(req, res) {
    if (req.method !== "GET" || req.headers.host !== `127.0.0.1:${port}`) return notFound(res);
    const raw = req.url ?? "";
    const q = raw.indexOf("?");
    const parts = segments(q === -1 ? raw : raw.slice(0, q));
    if (!parts || parts[0] !== "w" || parts[1] !== token) return notFound(res);
    const rest = parts.slice(2);
    if (rest.length === 1 && rest[0] === "widget.html") return void sendFile(res, "widget.html");
    if (rest.length === 2 && rest[0] === "assets" && ASSET.test(rest[1])) return void sendFile(res, `assets/${rest[1]}`);
    if (rest.length === 1 && rest[0] === "events") {
      const id = new URLSearchParams(q === -1 ? "" : raw.slice(q + 1)).get("id");
      if (!id || id.length > 100) return notFound(res);
      return events(req, res, id);
    }
    return notFound(res);
  }

  return {
    start() {
      return new Promise((resolve, reject) => {
        server = http.createServer(handle);
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
          port = server.address().port;
          resolve(port);
        });
      });
    },
    urlFor(sourceId, type) {
      return `http://127.0.0.1:${port}/w/${token}/widget.html?id=${encodeURIComponent(sourceId)}&type=${encodeURIComponent(type)}`;
    },
    stop() {
      for (const s of [...streams]) {
        s.close();
        s.res.destroy();
      }
      return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
    },
  };
}
