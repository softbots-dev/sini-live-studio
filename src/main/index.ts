import { app, BrowserWindow, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startController } from "./controller.js";

/*
  Proses utama Sini Live Studio. Hanya proses ini yang memegang sesi, alamat kirim siaran,
  WebSocket, dan mesin OBS; renderer (tampilan) tidak punya akses jaringan (CSP connect-src 'none')
  dan hanya bicara lewat `window.studio` (preload, contextBridge).
*/

const here = dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow | null = null;
let controller: ReturnType<typeof startController> | null = null;

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: "#08070b",
    title: "Sini Live Studio",
    show: false,
    webPreferences: {
      preload: join(here, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => win?.show());
  // Tautan keluar (halaman sambungan, dasbor) dibuka di browser bawaan; renderer tidak pernah berpindah halaman.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  void win.loadFile(join(here, "../renderer/index.html"));
  controller = startController(win);
  win.webContents.once("did-finish-load", () => controller?.start());
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => controller?.shutdown());
