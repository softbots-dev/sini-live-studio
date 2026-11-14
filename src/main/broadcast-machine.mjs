/*
  Mesin status siaran Sini Live Studio — alur sama dengan aplikasi Android (docs/phone-live.md):

    idle → checking → ready | blocked(reason)
    ready → starting → connecting → live
    connecting|live → reconnecting → (kembali) | failed("reconnect_exhausted")
    apa pun yang aktif → ended(reason) | failed(code)

  Alamat kirim (server + key) HANYA ada di closure `publish` di sini dan di mesin OBS selama siaran;
  `snapshot()` — satu-satunya yang dikirim ke tampilan — tidak pernah memuatnya. Jam & timer disuntikkan
  supaya tes deterministik.
*/
import { splitPublishUrl } from "./publish-url.mjs";

export const PING_FAST_MS = 4000;
export const PING_SLOW_MS = 15000;
export const SLOW_AFTER_MS = 90000;
export const RECONNECT_WINDOW_MS = 60000;
const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

const BLOCKERS = {
  broadcast_no_account: "no_account",
  broadcast_no_key: "no_key",
  broadcast_key_rotating: "key_rotating",
  channel_suspended: "channel_suspended",
};
const ACTIVE = new Set(["starting", "connecting", "live", "reconnecting"]);

const publicChannel = (c) => (c ? { id: c.id, slug: c.slug ?? null, title: c.title ?? null, categorySlug: c.categorySlug ?? null, isLive: Boolean(c.isLive) } : null);

/** Galat HTTP → keadaan tertahan (sebelum siaran). */
function blockedFrom(err) {
  if (err?.status === 401) return { phase: "blocked", reason: "signed_out" };
  if (err?.status === 403) return { phase: "blocked", reason: err.code === "account_suspended" ? "account_suspended" : "not_streamer" };
  if (err?.status === 503 && err.code === "maintenance") return { phase: "blocked", reason: "maintenance" };
  if (err?.status === 409 && BLOCKERS[err.code]) return { phase: "blocked", reason: BLOCKERS[err.code] };
  if (err?.status === 429) return { phase: "failed", code: "rate_limited", retryAfterMs: err.retryAfterMs ?? null };
  return { phase: "failed", code: typeof err?.code === "string" ? err.code : "unknown" };
}

export function createBroadcastMachine({ http, engine, liveMaintenance, now, setTimer, clearTimer, onChange = () => {} }) {
  let state = Object.freeze({ phase: "idle" });
  /** { server, key, profile } — rahasia, hanya selama siaran. */
  let publish = null;
  let pingTimer = null;
  let reconnectTimer = null;
  let connectingSince = 0;
  let reconnectSince = 0;
  let reconnectAttempt = 0;
  let resumePhase = "connecting";
  let liveSince = null;
  let orientation = "landscape";
  // Naik setiap siaran dimulai/dihentikan: jawaban async yang datang terlambat diabaikan.
  let session = 0;

  const set = (next) => {
    state = Object.freeze({ ...next });
    onChange(state);
  };

  function stopTimers() {
    if (pingTimer !== null) clearTimer(pingTimer);
    if (reconnectTimer !== null) clearTimer(reconnectTimer);
    pingTimer = reconnectTimer = null;
  }

  /** Hentikan siaran seketika: timer, alamat, dan keluaran OBS. */
  function shutdown(next) {
    stopTimers();
    session++;
    const had = publish !== null;
    publish = null;
    liveSince = null;
    set(next);
    if (had) void Promise.resolve(engine.stopStream()).catch(() => {});
  }

  function schedulePing(ms) {
    if (pingTimer !== null) clearTimer(pingTimer);
    pingTimer = setTimer(ping, ms);
  }

  async function ping() {
    pingTimer = null;
    const my = session;
    if (!publish || state.phase !== "connecting") return;
    let retryMs = null;
    try {
      const { data } = await http.post("/me/channel/broadcast/ping", {});
      if (my !== session || !publish) return;
      if (data?.isLive) {
        resumePhase = "live";
        liveSince = data.liveStartedAt ?? new Date(now()).toISOString();
        set({ phase: "live", orientation, liveSince });
        return;
      }
    } catch (err) {
      if (my !== session) return;
      if (err?.status === 401) return shutdown({ phase: "ended", reason: "auth_lost" });
      if (err?.status === 403) return shutdown({ phase: "ended", reason: err.code === "account_suspended" ? "account_suspended" : "not_streamer" });
      if (err?.status === 429) retryMs = err.retryAfterMs ?? null;
    }
    const slow = now() - connectingSince >= SLOW_AFTER_MS;
    if (slow && !state.slowStart) set({ ...state, slowStart: true });
    schedulePing(retryMs ?? (slow ? PING_SLOW_MS : PING_FAST_MS));
  }

  function reconnectTick() {
    reconnectTimer = null;
    if (!publish || state.phase !== "reconnecting") return;
    if (now() - reconnectSince >= RECONNECT_WINDOW_MS) return shutdown({ phase: "failed", code: "reconnect_exhausted" });
    const { server, key, profile } = publish;
    void Promise.resolve(engine.startStream({ server, key, profile })).catch(() => {});
    // Jeda berikutnya mengikuti daftar (2, 4, 8, 16, 30 dtk), dibatasi sisa jendela 60 dtk — percobaan
    // terakhir jatuh tepat di ujung jendela lalu menyerah.
    reconnectAttempt++;
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    const left = RECONNECT_WINDOW_MS - (now() - reconnectSince);
    reconnectTimer = setTimer(reconnectTick, Math.max(1, Math.min(delay, left)));
  }

  return {
    snapshot: () => state,
    isActive: () => ACTIVE.has(state.phase),

    /** Kesiapan sebelum siaran (tidak dijalankan saat siaran aktif). */
    async check() {
      if (ACTIVE.has(state.phase)) return;
      const my = session;
      set({ phase: "checking" });
      try {
        if (await liveMaintenance()) return set({ phase: "blocked", reason: "maintenance" });
        const { data } = await http.get("/me/channel/broadcast");
        if (my !== session) return;
        const channel = publicChannel(data?.channel);
        if (data?.blocker) return set({ phase: "blocked", reason: data.blocker, channel });
        set({ phase: "ready", channel, alreadyLive: Boolean(channel?.isLive) });
      } catch (err) {
        if (my === session) set(blockedFrom(err));
      }
    },

    async start({ title, categorySlug, orientation: wanted = "landscape" } = {}) {
      if (ACTIVE.has(state.phase)) return;
      const my = ++session;
      orientation = wanted === "portrait" ? "portrait" : "landscape";
      set({ phase: "starting", orientation });
      const body = { client: "studio", orientation };
      if (title !== undefined) body.title = title;
      if (categorySlug !== undefined) body.categorySlug = categorySlug;
      let out;
      try {
        out = await http.post("/me/channel/broadcast/start", body);
      } catch (err) {
        if (my === session) set(blockedFrom(err));
        return;
      }
      if (my !== session) return;
      let parts;
      try {
        parts = splitPublishUrl(out?.data?.publishUrl);
      } catch {
        return set({ phase: "failed", code: "publish_invalid" });
      }
      publish = { ...parts, profile: out.data.profile };
      try {
        await engine.startStream({ server: publish.server, key: publish.key, profile: publish.profile });
      } catch {
        if (my === session) shutdown({ phase: "failed", code: "output_failed" });
        return;
      }
      if (my !== session) return;
      connectingSince = now();
      resumePhase = "connecting";
      set({ phase: "connecting", orientation, slowStart: false });
      schedulePing(PING_FAST_MS);
    },

    /** Keluaran OBS tersambung (awal atau setelah sambung ulang). */
    outputStarted() {
      if (!publish || state.phase !== "reconnecting") return;
      if (reconnectTimer !== null) clearTimer(reconnectTimer);
      reconnectTimer = null;
      if (resumePhase === "live") set({ phase: "live", orientation, liveSince });
      else {
        set({ phase: "connecting", orientation, slowStart: now() - connectingSince >= SLOW_AFTER_MS });
        schedulePing(PING_FAST_MS);
      }
    },

    /** Keluaran OBS putus sendiri (jaringan). Akhiri oleh pengguna lewat `end()`, bukan ini. */
    outputStopped() {
      if (!publish || (state.phase !== "connecting" && state.phase !== "live")) return;
      if (pingTimer !== null) clearTimer(pingTimer);
      pingTimer = null;
      reconnectSince = now();
      reconnectAttempt = 0;
      set({ phase: "reconnecting", orientation });
      reconnectTimer = setTimer(reconnectTick, RECONNECT_DELAYS[0]);
    },

    /** Sesi dicabut / refresh gagal saat siaran. */
    authLost() {
      if (publish || ACTIVE.has(state.phase)) shutdown({ phase: "ended", reason: "auth_lost" });
      else set({ phase: "blocked", reason: "signed_out" });
    },

    async end() {
      shutdown({ phase: "ended", reason: "user" });
    },
  };
}
