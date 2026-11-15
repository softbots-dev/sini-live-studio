import { BrowserWindow } from "electron";

/*
  Lapisan seleksi pratinjau. Pratinjau OBS adalah jendela native di atas halaman, dan obs-studio-node 0.27
  tidak menggambar bingkai seleksi untuk scene berkanvas — jadi bingkai, 8 pegangan, dan garis jarak
  digambar di jendela transparan tanpa bingkai yang menempel tepat di atas elemen pratinjau. Jendela ini
  mengabaikan mouse (klik tembus ke pratinjau) dan tidak pernah mengambil fokus. Isinya hanya angka dari
  renderer; tidak ada data akun atau alamat kirim.
*/

export type Frame = {
  /** Kotak elemen pratinjau, piksel CSS relatif area konten jendela utama. */
  rect: { x: number; y: number; width: number; height: number };
  box: { x: number; y: number; w: number; h: number };
  guides: { x1: number; y1: number; x2: number; y2: number; label: number }[];
  locked: boolean;
};

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block}</style></head>
<body><canvas id="c"></canvas><script>
const c = document.getElementById("c"), g = c.getContext("2d");
const PINK = "#ec4899";
function draw(f) {
  const d = devicePixelRatio || 1, W = f ? f.rect.width : 1, H = f ? f.rect.height : 1;
  c.width = Math.max(1, Math.round(W * d)); c.height = Math.max(1, Math.round(H * d));
  c.style.width = W + "px"; c.style.height = H + "px";
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H);
  if (!f) return;
  g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
  g.strokeStyle = PINK; g.lineWidth = 1; g.setLineDash([]);
  g.font = "600 11px 'Segoe UI', sans-serif"; g.textBaseline = "middle";
  for (const l of f.guides) {
    g.beginPath(); g.moveTo(Math.round(l.x1) + 0.5, Math.round(l.y1) + 0.5); g.lineTo(Math.round(l.x2) + 0.5, Math.round(l.y2) + 0.5); g.stroke();
    const t = l.label + " px", tw = g.measureText(t).width + 10, mx = (l.x1 + l.x2) / 2, my = (l.y1 + l.y2) / 2;
    g.fillStyle = "rgba(8,7,11,0.85)"; g.fillRect(mx - tw / 2, my - 9, tw, 18);
    g.fillStyle = "#fff"; g.fillText(t, mx - tw / 2 + 5, my + 0.5);
  }
  const b = f.box;
  g.lineWidth = 2; if (f.locked) g.setLineDash([6, 4]);
  g.strokeRect(b.x, b.y, b.w, b.h); g.setLineDash([]);
  if (!f.locked) {
    const s = 8, pts = [[b.x, b.y], [b.x + b.w / 2, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y + b.h / 2]];
    for (const [x, y] of pts) { g.fillStyle = "#fff"; g.fillRect(x - s / 2, y - s / 2, s, s); g.lineWidth = 1.5; g.strokeRect(x - s / 2, y - s / 2, s, s); }
  }
  g.restore();
}
</script></body></html>`;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Hanya angka yang diteruskan ke halaman lapisan. */
function clean(f: Frame): Frame {
  return {
    rect: { x: num(f.rect?.x), y: num(f.rect?.y), width: Math.max(1, num(f.rect?.width)), height: Math.max(1, num(f.rect?.height)) },
    box: { x: num(f.box?.x), y: num(f.box?.y), w: num(f.box?.w), h: num(f.box?.h) },
    guides: (Array.isArray(f.guides) ? f.guides.slice(0, 4) : []).map((l) => ({ x1: num(l.x1), y1: num(l.y1), x2: num(l.x2), y2: num(l.y2), label: Math.round(num(l.label)) })),
    locked: f.locked === true,
  };
}

export function createSelectionOverlay(parent: BrowserWindow) {
  let overlay: BrowserWindow | null = null;
  let ready: Promise<void> | null = null;
  let last: Frame | null = null;

  function ensure() {
    if (overlay && !overlay.isDestroyed()) return overlay;
    overlay = new BrowserWindow({
      parent,
      frame: false,
      transparent: true,
      focusable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    overlay.setIgnoreMouseEvents(true);
    ready = overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`).then(() => {});
    return overlay;
  }

  function place() {
    if (!last || !overlay || overlay.isDestroyed()) return;
    const c = parent.getContentBounds();
    overlay.setBounds({ x: Math.round(c.x + last.rect.x), y: Math.round(c.y + last.rect.y), width: Math.round(last.rect.width), height: Math.round(last.rect.height) });
  }

  function hide() {
    last = null;
    if (overlay && !overlay.isDestroyed()) overlay.hide();
  }

  parent.on("move", place);
  parent.on("resize", place);
  parent.on("minimize", hide);
  parent.on("closed", () => {
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    overlay = null;
  });

  return {
    async draw(frame: Frame | null) {
      if (!frame || parent.isMinimized() || !parent.isVisible()) return hide();
      const w = ensure();
      last = clean(frame);
      place();
      await ready;
      if (w.isDestroyed() || !last) return;
      await w.webContents.executeJavaScript(`draw(${JSON.stringify(last)})`).catch(() => {});
      if (last && !w.isVisible()) w.showInactive();
    },
    hide,
  };
}
