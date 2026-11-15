import { app, dialog, ipcMain, Menu, shell, type BrowserWindow } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { createChatModel } from "./chat-model.mjs";
import { createRealtime } from "./realtime.mjs";
import { createBroadcastMachine } from "./broadcast-machine.mjs";
import { webOrigin } from "./config.mjs";
import { createCookieJar, createHttp, StudioHttpError } from "./http.mjs";
import { runLink, siteLocale } from "./link.mjs";
import { liveMaintenance } from "./maintenance.mjs";
import { createPerfPoller } from "./perf.mjs";
import { menuTemplate } from "./menu.mjs";
import { createSelectionOverlay, type Frame } from "./overlay.js";
import { CANVAS, createSceneManager, validateSourceSettings } from "./scene-manager.mjs";
import { sessionStore } from "./session-store.js";
import { ObsEngine, SOURCE_KINDS, type FilterKind, type Profile, type SourceKind } from "./engine/obs.js";

/*
  Pengendali proses utama: sesi Sini, sambungan lewat browser, mesin OBS, scene, dan mesin status siaran.
  Renderer hanya menerima status dan data tampilan lewat IPC — tidak pernah cookie atau alamat kirim.
*/

type User = { id: string; username: string; displayName: string; avatarUrl: string | null; roles: string[] };
type Account = { status: "loading" | "signedOut" | "signedIn"; user: User | null };

/** Halaman web yang boleh dibuka studio di browser (selain halaman sambungan). */
const EXTERNAL_PATHS = new Set(["/become-streamer/", "/dashboard/", "/dashboard/monetization/", "/settings/?tab=security", "/studio/", "/p/terms-of-service/", "/p/privacy-policy/"]);
/** Bahasa yang bisa dipilih di studio (sama dengan bahasa situs). */
const LOCALES = ["id", "en", "de", "es", "fil", "fr", "hi", "it", "ja", "ko", "ms", "nl", "pl", "pt-br", "ru", "th", "tr", "vi", "zh-cn", "zh-tw"];

export function startController(win: BrowserWindow) {
  const origin = webOrigin({ packaged: app.isPackaged, env: process.env });
  const selection = createSelectionOverlay(win);
  /** Bahasa pilihan pengguna (Pengaturan) atau bahasa sistem — juga bahasa halaman sini.live yang dibuka. */
  const rawLocale = () => readSettings().locale ?? app.getLocale();
  const siteLang = () => siteLocale(rawLocale());
  const jar = createCookieJar(sessionStore.load() ?? {}, (cookies: Record<string, string>) => {
    if (Object.keys(cookies).length) sessionStore.save(cookies);
    else sessionStore.clear();
  });
  const rawHttp = createHttp({ origin, version: app.getVersion(), jar });
  let account: Account = { status: "loading", user: null };
  let linkAbort: AbortController | null = null;
  let engineReady = false;
  let engineError: string | null = null;
  let scenes: ReturnType<typeof createSceneManager> | null = null;
  let statsTimer: NodeJS.Timeout | null = null;
  // Item diputar/dicermin beracuan tengah: posisinya diterapkan ulang saat ukuran sumber berubah.
  const orientTimer = setInterval(() => {
    try {
      scenes?.reapplyOriented();
    } catch {
      // mesin belum siap / sudah mati
    }
  }, 1000);

  const send = (channel: string, payload: unknown) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };

  // ── HTTP dengan deteksi sesi hilang ────────────────────────────────────────
  const http = {
    origin,
    async get(path: string) {
      try {
        return await rawHttp.get(path);
      } catch (err) {
        onHttpError(err);
        throw err;
      }
    },
    async post(path: string, body?: unknown) {
      try {
        return await rawHttp.post(path, body);
      } catch (err) {
        onHttpError(err);
        throw err;
      }
    },
    async del(path: string) {
      try {
        return await rawHttp.del(path);
      } catch (err) {
        onHttpError(err);
        throw err;
      }
    },
  };

  // ── Chat (gateway) ────────────────────────────────────────────────────────
  const chat = createChatModel();
  let chatTimer: NodeJS.Timeout | null = null;
  let roomSlug: string | null = null;
  let chatStatus: "idle" | "connecting" | "connected" = "idle";
  const pushChat = () => {
    if (chatTimer) return;
    chatTimer = setTimeout(() => {
      chatTimer = null;
      send("chat", { status: chatStatus, ...chat.snapshot() });
    }, 120);
  };
  const realtime = createRealtime({
    origin,
    cookieHeader: () => jar.header(),
    WebSocket,
    signedIn: () => account.status === "signedIn",
    refreshSession: async () => {
      try {
        await rawHttp.post("/auth/refresh");
        return true;
      } catch (err) {
        // Sesi dicabut/kedaluwarsa: sama dengan 401 dari HTTP — hentikan siaran & keluar.
        if (err instanceof StudioHttpError && err.status === 401) onHttpError(new StudioHttpError(401, "login_required"));
        return false;
      }
    },
    onEvent: (msg: { type: string; data: any }) => {
      if (msg.type === "room.state") chatStatus = "connected";
      if (msg.type === "socket.closed") chatStatus = "connecting";
      if (msg.type === "chat.rejected") send("chat.rejected", { code: msg.data?.code ?? null });
      if (msg.type === "stats.changed") perf.refresh();
      chat.apply(msg);
      pushChat();
    },
  });
  function joinRoom(slug: string | null | undefined) {
    if (!slug || slug === roomSlug) return;
    roomSlug = slug;
    chatStatus = "connecting";
    chat.reset();
    realtime.connect(slug);
    pushChat();
  }
  /** Scene akun ini dilepas dari mesin (keluar / sesi hilang) supaya akun lain tidak mewarisinya. */
  function resetScenes() {
    try {
      scenes?.teardown();
    } catch {
      // mesin sudah mati
    }
    scenes = null;
    send("scenes", null);
  }
  function leaveRoom() {
    roomSlug = null;
    chatStatus = "idle";
    realtime.disconnect();
    chat.reset();
    pushChat();
  }

  function onHttpError(err: unknown) {
    if (err instanceof StudioHttpError && err.status === 401 && err.code === "login_required" && account.status === "signedIn") {
      machine.authLost();
      leaveRoom();
      resetScenes();
      setAccount({ status: "signedOut", user: null });
      jar.clear();
    }
  }

  function setAccount(next: Account) {
    account = next;
    // Pratinjau adalah jendela native di atas halaman: tanpa ini ia tetap menutupi layar masuk sebagai
    // kotak hitam setelah keluar.
    if (next.status !== "signedIn") selection.hide();
    if (next.status !== "signedIn" && engineReady) {
      try {
        engine.hideDisplay();
      } catch {
        // mesin sudah mati
      }
    }
    send("account", account);
  }

  // ── Mesin OBS ─────────────────────────────────────────────────────────────
  const volumes = new Map<string, number[]>();
  let volmeterTimer: NodeJS.Timeout | null = null;
  const engine = new ObsEngine({
    onOutput: (s) => {
      if (s.signal === "start" || s.signal === "reconnect_success") machine.outputStarted();
      else if (s.signal === "stop" && s.code !== 0) machine.outputStopped();
    },
    onVolmeter: (id, peak) => {
      volumes.set(id, peak);
      if (!volmeterTimer)
        volmeterTimer = setTimeout(() => {
          volmeterTimer = null;
          send("volmeter", Object.fromEntries(volumes));
        }, 100);
    },
  });

  const settingsFile = () => join(app.getPath("userData"), "settings.json");
  function readSettings(): { encoder?: string; locale?: string } {
    try {
      return JSON.parse(readFileSync(settingsFile(), "utf8")) as { encoder?: string; locale?: string };
    } catch {
      return {};
    }
  }

  function initEngine() {
    try {
      engine.init({ appDataPath: join(app.getPath("userData"), "obs"), version: app.getVersion(), locale: app.getLocale() || "en-US" });
      engine.preferredEncoder = readSettings().encoder;
      engineReady = true;
    } catch (err) {
      engineError = err instanceof Error ? err.message : "obs_init";
    }
    send("engine", { ready: engineReady, error: engineError });
    if (engineReady && account.user) loadScenes(account.user.id);
  }

  // Pengelola scene memakai antarmuka sempit; kanvas dari orientasi.
  const engineForScenes = {
    createSource: (id: string, kind: SourceKind, settings: Record<string, unknown>) => engine.createSource(id, kind, settings),
    updateSource: (id: string, settings: Record<string, unknown>) => engine.updateSource(id, settings),
    removeSource: (id: string) => engine.removeSource(id),
    createScene: (id: string) => engine.createScene(id),
    removeScene: (id: string) => engine.removeScene(id),
    setActiveScene: (id: string) => engine.setActiveScene(id),
    addItem: (s: string, i: string, src: string, t: Parameters<ObsEngine["addItem"]>[3]) => engine.addItem(s, i, src, t),
    setItem: (s: string, i: string, t: Parameters<ObsEngine["setItem"]>[2]) => engine.setItem(s, i, t),
    removeItem: (s: string, i: string) => engine.removeItem(s, i),
    orderItems: (s: string, keys: string[]) => engine.orderItems(s, keys),
    setVolume: (id: string, mul: number) => engine.setVolume(id, mul),
    setMuted: (id: string, muted: boolean) => engine.setMuted(id, muted),
    setMonitoring: (id: string, mode: "none" | "monitor" | "monitorAndOutput") => engine.setMonitoring(id, mode),
    setFilters: (id: string, f: { kind: FilterKind; settings?: Record<string, unknown> }[]) => engine.setFilters(id, f),
    setCanvas: (size: { width: number; height: number }) => engine.setCanvas({ ...size, fps: 30, videoKbps: 6000, audioKbps: 160 }),
  };

  function collectionFile(userId: string) {
    const dir = join(app.getPath("userData"), "collections");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return join(dir, `${userId.replace(/[^a-zA-Z0-9-]/g, "")}.json`);
  }

  function loadScenes(userId: string) {
    if (!engineReady || scenes) return;
    const file = collectionFile(userId);
    scenes = createSceneManager({
      engine: engineForScenes,
      load: () => (existsSync(file) ? readFileSync(file, "utf8") : null),
      save: (json: string) => writeFileSync(file, json),
      newId: (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`,
    });
    scenes.apply();
    pushScenes();
  }

  const pushScenes = () => scenes && send("scenes", scenes.snapshot());

  // ── Mesin status siaran ───────────────────────────────────────────────────
  let perfValue: unknown = { session: null };
  const perf = createPerfPoller({
    fetch: async () => (await http.get("/me/channel/live-stats")).data,
    now: Date.now,
    setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimer: (id: NodeJS.Timeout) => clearTimeout(id),
    onChange: (value: unknown) => {
      perfValue = value;
      send("perf", value);
    },
  });
  const machine = createBroadcastMachine({
    http,
    engine: {
      startStream: (o: { server: string; key: string; profile: Profile }) => engine.startStream(o),
      stopStream: () => engine.stopStream(),
    },
    liveMaintenance: async () => liveMaintenance((await http.get("/catalog")).data?.settings),
    now: Date.now,
    setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimer: (id: NodeJS.Timeout) => clearTimeout(id),
    onChange: (state: { phase: string; channel?: { slug: string | null } | null }) => {
      send("broadcast", state);
      if (state.phase === "live") perf.start();
      else if (!["connecting", "reconnecting"].includes(state.phase)) perf.stop();
      if (state.channel?.slug && account.status === "signedIn") joinRoom(state.channel.slug);
      const active = ["starting", "connecting", "live", "reconnecting"].includes(state.phase);
      if (active && !statsTimer) statsTimer = setInterval(() => send("stats", engine.stats()), 1000);
      if (!active && statsTimer) {
        clearInterval(statsTimer);
        statsTimer = null;
        send("stats", engine.stats());
      }
    },
  });

  // ── Akun ──────────────────────────────────────────────────────────────────
  async function refreshAccount() {
    if (!jar.has("sini_at") && !jar.has("sini_rt")) return setAccount({ status: "signedOut", user: null });
    try {
      const { data } = await http.get("/me");
      const user: User = { id: data.id, username: data.username, displayName: data.displayName, avatarUrl: data.avatarUrl ?? null, roles: data.roles ?? [] };
      setAccount({ status: "signedIn", user });
      loadScenes(user.id);
      void machine.check();
    } catch (err) {
      if (err instanceof StudioHttpError && err.status === 401) {
        jar.clear();
        setAccount({ status: "signedOut", user: null });
      } else setAccount({ status: "signedOut", user: null });
    }
  }

  // ── IPC ───────────────────────────────────────────────────────────────────
  const handle = (channel: string, fn: (...args: any[]) => unknown) => ipcMain.handle(channel, (_e, ...args) => fn(...args));
  const guard = <T>(fn: () => T): { ok: true; value: T } | { ok: false; code: string } => {
    try {
      const value = fn();
      pushScenes();
      return { ok: true, value };
    } catch (err) {
      return { ok: false, code: (err as { code?: string; message?: string }).code ?? (err as Error).message ?? "error" };
    }
  };
  const needScenes = () => {
    if (!scenes) throw Object.assign(new Error("engine_not_ready"), { code: "engine_not_ready" });
    return scenes;
  };

  handle("app.locale", () => rawLocale());
  handle("app.info", () => ({ version: app.getVersion(), origin, locale: siteLang() }));
  handle("settings.setLocale", (code: string | null) => {
    if (code !== null && !LOCALES.includes(code)) return;
    const next = { ...readSettings(), locale: code ?? undefined };
    writeFileSync(settingsFile(), JSON.stringify(next));
    send("locale", rawLocale());
  });
  handle("account.get", () => account);
  handle("engine.get", () => ({ ready: engineReady, error: engineError }));

  handle("link.start", async () => {
    linkAbort?.abort();
    const ctl = new AbortController();
    linkAbort = ctl;
    try {
      const result = await runLink({ http: rawHttp, locale: siteLang(), openExternal: (u: string) => shell.openExternal(u), onCode: (code: string) => send("link.code", code), signal: ctl.signal });
      if (result === "linked") await refreshAccount();
      return result;
    } catch (err) {
      return err instanceof StudioHttpError ? `error:${err.code}` : "error:unknown";
    } finally {
      if (linkAbort === ctl) linkAbort = null;
    }
  });
  handle("link.cancel", () => linkAbort?.abort());

  handle("account.signOut", async () => {
    if (machine.isActive()) return { ok: false, code: "live" };
    try {
      await rawHttp.post("/auth/logout");
    } catch {
      // sesi mungkin sudah habis
    }
    jar.clear();
    leaveRoom();
    resetScenes();
    setAccount({ status: "signedOut", user: null });
    return { ok: true };
  });

  handle("open.web", (path: string) => {
    if (EXTERNAL_PATHS.has(path)) void shell.openExternal(`${origin}/${siteLang()}${path}`);
  });
  /** Halaman channel sendiri di sini.live (slug dari kesiapan siaran). */
  handle("open.channel", () => {
    const slug = (machine.snapshot() as { channel?: { slug?: string | null } | null }).channel?.slug;
    if (slug && /^[a-z0-9-]{1,80}$/.test(slug)) void shell.openExternal(`${origin}/${siteLang()}/channel/${slug}/`);
  });
  handle("perf.get", () => perfValue);

  handle("catalog.categories", async () => {
    try {
      const { data } = await http.get("/catalog");
      return (data?.categories ?? []).map((c: { slug: string; name: string }) => ({ slug: c.slug, name: c.name }));
    } catch {
      return [];
    }
  });

  handle("broadcast.get", () => machine.snapshot());
  handle("chat.get", () => ({ status: chatStatus, ...chat.snapshot() }));
  handle("chat.send", (body: string) => {
    const text = String(body ?? "").trim().slice(0, 500);
    if (!text) return false;
    return realtime.send("chat.send", { body: text, nonce: randomUUID() });
  });
  handle("chat.delete", async (id: string) => {
    try {
      await http.del(`/chat/messages/${encodeURIComponent(id)}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, code: err instanceof StudioHttpError ? err.code : "error" };
    }
  });
  handle("chat.ban", async (username: string, type: "timeout" | "permanent") => {
    if (!roomSlug) return { ok: false, code: "no_room" };
    try {
      await http.post(`/channels/${encodeURIComponent(roomSlug)}/chat/bans`, { username, type, ...(type === "timeout" ? { durationSec: 600 } : {}) });
      return { ok: true };
    } catch (err) {
      return { ok: false, code: err instanceof StudioHttpError ? err.code : "error" };
    }
  });
  handle("broadcast.check", () => machine.check());
  handle("broadcast.start", (opts: { title?: string; categorySlug?: string | null }) => {
    if (!scenes) return;
    return machine.start({ ...opts, orientation: scenes.orientation() });
  });
  handle("broadcast.end", () => machine.end());

  handle("scenes.get", () => scenes?.snapshot() ?? null);
  handle("scene.add", (name: string) => guard(() => needScenes().addScene(name)));
  handle("scene.rename", (id: string, name: string) => guard(() => needScenes().renameScene(id, name)));
  handle("scene.remove", (id: string) => guard(() => needScenes().removeScene(id)));
  handle("scene.activate", (id: string) => guard(() => needScenes().setActiveScene(id)));
  handle("orientation.set", (o: "landscape" | "portrait") => {
    if (machine.isActive()) return { ok: false, code: "live" };
    return guard(() => needScenes().setOrientation(o));
  });

  handle("source.add", async (kind: SourceKind, name: string, settings: Record<string, unknown>) => {
    if (!SOURCE_KINDS.includes(kind)) return { ok: false, code: "source_kind" };
    const valid = validateSourceSettings(kind, settings ?? {});
    if (!valid.ok) return valid;
    const res = guard(() => needScenes().addSource(kind, name, settings ?? {}));
    if (res.ok) void fitItem(res.value.itemId, res.value.sourceId, kind);
    return res;
  });
  handle("source.update", (id: string, settings: Record<string, unknown>) => {
    const kind = scenes?.snapshot().sources.find((s: { id: string }) => s.id === id)?.kind;
    const valid = validateSourceSettings(kind, settings ?? {});
    if (!valid.ok) return valid;
    return guard(() => needScenes().updateSource(id, settings));
  });
  handle("source.rename", (id: string, name: string) => guard(() => needScenes().renameSource(id, name)));
  handle("source.options", (id: string, property: string) => {
    try {
      return engine.sourceOptions(id, property);
    } catch {
      return [];
    }
  });
  handle("source.pickVideo", async () => {
    const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm", "flv", "avi"] }] });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });
  handle("source.pickImage", async () => {
    const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }] });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });

  handle("item.set", (id: string, patch: Record<string, unknown>) => guard(() => needScenes().setItem(id, patch)));
  handle("item.move", (id: string, dir: "up" | "down" | "top" | "bottom") => guard(() => needScenes().moveItem(id, dir)));
  handle("item.remove", (id: string) => guard(() => needScenes().removeItem(id)));
  handle("item.select", (id: string | null) => {
    const s = scenes?.snapshot();
    if (s) engine.selectItem(s.activeSceneId, id);
  });
  handle("item.sizes", () => {
    const s = scenes?.snapshot();
    if (!s) return {};
    const scene = s.scenes.find((x: { id: string }) => x.id === s.activeSceneId);
    const out: Record<string, { width: number; height: number }> = {};
    for (const item of scene?.items ?? []) {
      try {
        out[item.id] = engine.itemSize(s.activeSceneId, item.id);
      } catch {
        // item tanpa sumber
      }
    }
    return out;
  });

  handle("audio.volume", (id: string, mul: number) => guard(() => needScenes().setVolume(id, mul)));
  handle("audio.mute", (id: string, muted: boolean) => guard(() => needScenes().setMuted(id, muted)));
  handle("audio.monitor", (id: string, mode: "none" | "monitor" | "monitorAndOutput") => guard(() => needScenes().setMonitoring(id, mode)));
  handle("filters.set", (id: string, filters: { kind: FilterKind; settings?: Record<string, unknown> }[]) => guard(() => needScenes().setFilters(id, filters)));

  handle("display.bounds", (b: { x: number; y: number; width: number; height: number }) => {
    if (!engineReady) return null;
    engine.attachDisplay(win.getNativeWindowHandle(), b);
    return engine.previewArea();
  });
  handle("display.hide", () => {
    selection.hide();
    engine.hideDisplay();
  });
  handle("overlay.draw", (frame: Frame | null) => selection.draw(frame));
  /** Menu klik kanan native (di atas jendela pratinjau). Menjawab id entri yang dipilih, atau null. */
  handle(
    "menu.popup",
    (entries: unknown) =>
      new Promise<string | null>((resolve) => {
        let done = false;
        const finish = (id: string | null) => {
          if (done) return;
          done = true;
          resolve(id);
        };
        const menu = Menu.buildFromTemplate(menuTemplate(entries, (id: string) => finish(id)));
        // Klik bisa datang sesaat setelah menu tertutup — beri jeda sebelum menyatakan "tidak memilih".
        menu.popup({ window: win, callback: () => setTimeout(() => finish(null), 100) });
      }),
  );
  handle("display.area", () => engine.previewArea());
  handle("canvas.get", () => (scenes ? CANVAS[scenes.orientation() as "landscape" | "portrait"] : CANVAS.landscape));

  handle("settings.get", () => ({ encoder: readSettings().encoder ?? null, encoders: engineReady ? engine.encoders() : [] }));
  handle("settings.setEncoder", (id: string | null) => {
    const next = { ...readSettings(), encoder: id ?? undefined };
    writeFileSync(settingsFile(), JSON.stringify(next));
    engine.preferredEncoder = id ?? undefined;
  });

  /** Sumber baru dipaskan ke kanvas begitu ukurannya diketahui (kamera/layar/jendela/game). */
  async function fitItem(itemId: string, sourceId: string, kind: SourceKind) {
    if (!["dshow_input", "monitor_capture", "window_capture", "game_capture", "image_source", "ffmpeg_source", "browser_source"].includes(kind)) return;
    const s = scenes?.snapshot();
    if (!s) return;
    const canvas = CANVAS[s.orientation as "landscape" | "portrait"];
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 150));
      let size: { width: number; height: number };
      try {
        size = engine.itemSize(s.activeSceneId, itemId);
      } catch {
        return;
      }
      if (size.width > 0 && size.height > 0) {
        const scale = Math.min(canvas.width / size.width, canvas.height / size.height);
        const x = Math.round((canvas.width - size.width * scale) / 2);
        const y = Math.round((canvas.height - size.height * scale) / 2);
        scenes?.setItem(itemId, { x, y, scaleX: scale, scaleY: scale });
        pushScenes();
        return;
      }
    }
    void sourceId;
  }

  return {
    start() {
      setImmediate(initEngine);
      void refreshAccount();
    },
    isLive: () => machine.isActive(),
    phase: () => (machine.snapshot() as { phase: string }).phase,
    end: () => machine.end(),
    shutdown() {
      clearInterval(orientTimer);
      if (statsTimer) clearInterval(statsTimer);
      realtime.disconnect();
      try {
        engine.shutdown();
      } catch {
        // abaikan
      }
    },
  };
}
