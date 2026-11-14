/*
  Klien WebSocket gateway Sini untuk studio (proses utama). Sama dengan web & Android:
  - header `Origin` = origin web (gateway hanya menerima soket seasal), cookie sesi dari jar
  - `room.join` channel sendiri; pemilik tidak dihitung penonton (gateway)
  - `session` {user:false} padahal masuk → refresh sesi lalu sambung ulang (CLAUDE.md §4.19)
  - tutup 1012/1013 → sambung ulang dengan jitter 1–5 dtk (§8); tutup lain → mundur 1, 2, 4… maks. 30 dtk
  - presence.ping tiap 25 dtk; tanpa pong 8 dtk → tutup & sambung ulang
*/
const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 8_000;

export function realtimeUrl(origin) {
  return `${origin.replace(/^http/, "ws").replace(/\/+$/, "")}/realtime`;
}

export function createRealtime({ origin, cookieHeader, WebSocket, onEvent, refreshSession, signedIn, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout, setInterval: every = setInterval, clearInterval: stopEvery = clearInterval }) {
  let ws = null;
  let slug = null;
  let stopped = true;
  let retry = 0;
  let reconnectTimer = null;
  let heartbeat = null;
  let pongTimer = null;
  let refreshing = false;
  let soon = false;

  function cleanup() {
    if (heartbeat !== null) stopEvery(heartbeat);
    if (pongTimer !== null) clearTimer(pongTimer);
    heartbeat = pongTimer = null;
  }

  function schedule(code) {
    if (stopped || reconnectTimer !== null) return;
    let delay;
    if (soon) delay = 250;
    else if (code === 1012 || code === 1013) delay = 1000 + Math.floor(random() * 4000);
    else delay = Math.min(30_000, 1000 * 2 ** retry);
    soon = false;
    retry++;
    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      open();
    }, delay);
  }

  function open() {
    if (stopped || !slug) return;
    const headers = { origin };
    const cookie = cookieHeader();
    if (cookie) headers.cookie = cookie;
    const sock = new WebSocket(realtimeUrl(origin), { headers });
    ws = sock;
    sock.on("open", () => {
      if (ws !== sock) return;
      sock.send(JSON.stringify({ type: "room.join", data: { slug } }));
      heartbeat = every(() => {
        if (pongTimer !== null) return;
        try {
          sock.send(JSON.stringify({ type: "presence.ping" }));
        } catch {
          return;
        }
        pongTimer = setTimer(() => sock.close(), PONG_TIMEOUT_MS);
      }, HEARTBEAT_MS);
    });
    sock.on("message", (raw) => {
      if (ws !== sock) return;
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === "presence.pong") {
        if (pongTimer !== null) clearTimer(pongTimer);
        pongTimer = null;
        return;
      }
      if (msg.type === "room.state") retry = 0;
      if (msg.type === "session" && !msg.data?.user && signedIn() && !refreshing) {
        refreshing = true;
        void Promise.resolve(refreshSession())
          .then((ok) => {
            if (ok && ws === sock) {
              soon = true;
              sock.close();
            }
          })
          .finally(() => {
            refreshing = false;
          });
        return;
      }
      onEvent(msg);
    });
    sock.on("close", (code) => {
      if (ws !== sock) return;
      cleanup();
      ws = null;
      onEvent({ type: "socket.closed", data: { code } });
      schedule(code);
    });
    sock.on("error", () => {
      // `close` menyusul.
    });
  }

  return {
    connect(channelSlug) {
      if (slug === channelSlug && !stopped) return;
      this.disconnect();
      slug = channelSlug;
      stopped = false;
      retry = 0;
      open();
    },
    disconnect() {
      stopped = true;
      if (reconnectTimer !== null) clearTimer(reconnectTimer);
      reconnectTimer = null;
      cleanup();
      const sock = ws;
      ws = null;
      try {
        sock?.close();
      } catch {
        // sudah tertutup
      }
    },
    send(type, data) {
      if (!ws) return false;
      try {
        ws.send(JSON.stringify({ type, data }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
