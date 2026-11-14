import { app } from "electron";
import electronUpdater from "electron-updater";

/*
  Pembaruan otomatis dari GitHub Releases repo publik (electron-builder.yml `publish`). Hanya di build
  terpasang; diunduh di latar, dipasang saat aplikasi DITUTUP. Menutup aplikasi saat siaran dicegah
  penjaga keluar (quit-guard.mjs), jadi pembaruan tidak pernah terpasang di tengah siaran.
*/
export function startUpdater() {
  if (!app.isPackaged) return;
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  void autoUpdater.checkForUpdates().catch(() => {
    // tanpa jaringan / belum ada rilis — dicoba lagi saat aplikasi dibuka berikutnya
  });
}
