import { app, BrowserWindow, ipcMain, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startController } from "./controller.js";
import { canQuit } from "./quit-guard.mjs";
import { startUpdater } from "./updater.js";

/*
  Proses utama Sini Live Studio. Hanya proses ini yang memegang sesi, alamat kirim siaran,
  WebSocket, dan mesin OBS; renderer (tampilan) tidak punya akses jaringan (CSP connect-src 'none')
  dan hanya bicara lewat `window.studio` (preload, contextBridge).
*/

const here = dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow | null = null;
let controller: ReturnType<typeof startController> | null = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: "#08070b",
    title: "Sini Live Studio",
    // Bilah judul milik aplikasi (logo, judul siaran, akun) dengan tombol jendela asli Windows di kanan.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#0b0a10", symbolColor: "#9a95ad", height: 40 },
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
  // Menutup saat siaran aktif: tanya dulu (dialog di tampilan), jangan tutup diam-diam.
  win.on("close", (event) => {
    if (quitting || !controller || canQuit(controller.phase())) return;
    event.preventDefault();
    win?.webContents.send("quit.ask", null);
  });
  void win.loadFile(join(here, "../renderer/index.html"));
  controller = startController(win);
  win.webContents.once("did-finish-load", () => controller?.start());
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  createWindow();
  startUpdater();
});

ipcMain.handle("quit.confirm", async () => {
  await controller?.end();
  quitting = true;
  app.quit();
});
ipcMain.handle("quit.cancel", () => undefined);
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => controller?.shutdown());
