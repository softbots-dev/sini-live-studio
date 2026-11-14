import { contextBridge, ipcRenderer } from "electron";

/*
  Satu-satunya jembatan renderer → proses utama. Tidak pernah mengoper alamat kirim siaran,
  cookie sesi, atau isi rahasia lain ke renderer — hanya status dan perintah.
*/
const studio = {
  locale: (): Promise<string> => ipcRenderer.invoke("app.locale"),
};

contextBridge.exposeInMainWorld("studio", studio);

export type StudioBridge = typeof studio;
