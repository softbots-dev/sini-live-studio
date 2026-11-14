/*
  Klien HTTP proses utama Sini Live Studio. Seperti aplikasi Android (ApiClient.kt): header `Origin` =
  origin web Sini (gateway & passkey membandingkannya), cookie sesi di jar sendiri, `login_required`/401
  → satu kali POST /v1/auth/refresh lalu ulang (CLAUDE.md §4.26). Galat hanya {status, code} — tidak pernah
  isi jawaban mentah (bisa memuat data yang tidak perlu sampai ke tampilan atau log).
*/

export class StudioHttpError extends Error {
  constructor(status, code, retryAfterMs = null) {
    super(code);
    this.name = "StudioHttpError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Jar cookie sederhana: nama → nilai (domain tunggal = origin Sini). */
export function createCookieJar(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    store(setCookies) {
      for (const line of setCookies ?? []) {
        const [pair, ...attrs] = String(line).split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        const expired = attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a)) || attrs.some((a) => /^\s*expires\s*=/i.test(a) && Date.parse(a.split("=").slice(1).join("=")) < Date.now());
        if (expired || value === "") map.delete(name);
        else map.set(name, value);
      }
    },
    header() {
      return [...map].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    clear() {
      map.clear();
    },
    has(name) {
      return map.has(name);
    },
    toJSON() {
      return Object.fromEntries(map);
    },
  };
}

const REFRESHABLE = new Set(["login_required", "unauthenticated", "token_expired"]);

export function createHttp({ origin, version, jar, fetch: fetchFn = globalThis.fetch }) {
  const base = `${origin.replace(/\/+$/, "")}/v1`;

  async function raw(method, path, body) {
    const headers = { origin, "user-agent": `SiniLiveStudio/${version} (Windows)`, accept: "application/json" };
    const cookie = jar.header();
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    let res;
    try {
      res = await fetchFn(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    } catch {
      throw new StudioHttpError(0, "network");
    }
    jar.store(res.headers.getSetCookie?.() ?? []);
    let json = null;
    try {
      const text = await res.text();
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { res, json };
  }

  function fail(res, json) {
    const retry = Number(res.headers.get("retry-after"));
    return new StudioHttpError(res.status, typeof json?.code === "string" ? json.code : res.status >= 500 ? "server_error" : "request_failed", Number.isFinite(retry) && retry > 0 ? retry * 1000 : null);
  }

  async function call(method, path, body) {
    let { res, json } = await raw(method, path, body);
    if (res.status === 401 && path !== "/auth/refresh" && (json?.code === undefined || REFRESHABLE.has(json.code))) {
      const refreshed = await raw("POST", "/auth/refresh");
      if (!refreshed.res.ok) throw new StudioHttpError(401, "login_required");
      ({ res, json } = await raw(method, path, body));
      if (res.status === 401) throw new StudioHttpError(401, "login_required");
    }
    if (!res.ok) throw fail(res, json);
    return { status: res.status, data: json?.data ?? null };
  }

  return {
    origin,
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body ?? {}),
    del: (path) => call("DELETE", path),
  };
}
