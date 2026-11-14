import { app, safeStorage } from "electron";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/*
  Cookie sesi Sini disimpan terenkripsi oleh Windows (DPAPI lewat Electron safeStorage) di folder data
  aplikasi. Tanpa enkripsi OS yang tersedia, sesi tidak disimpan (pengguna masuk lagi saat membuka studio).
*/
const file = () => join(app.getPath("userData"), "session.bin");

export const sessionStore = {
  load(): Record<string, string> | null {
    try {
      if (!existsSync(file()) || !safeStorage.isEncryptionAvailable()) return null;
      const parsed = JSON.parse(safeStorage.decryptString(readFileSync(file())));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
    } catch {
      return null;
    }
  },
  save(cookies: Record<string, string>) {
    if (!safeStorage.isEncryptionAvailable()) return;
    writeFileSync(file(), safeStorage.encryptString(JSON.stringify(cookies)));
  },
  clear() {
    rmSync(file(), { force: true });
  },
};
