import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

/*
  Satu-satunya jembatan renderer → proses utama. Tidak pernah mengoper alamat kirim siaran,
  cookie sesi, atau isi rahasia lain ke renderer — hanya status dan perintah.
*/
const INVOKE = new Set([
  "app.locale", "app.info", "account.get", "engine.get", "link.start", "link.cancel", "account.signOut", "open.web",
  "catalog.categories", "broadcast.get", "broadcast.check", "broadcast.start", "broadcast.end",
  "scenes.get", "scene.add", "scene.rename", "scene.remove", "scene.activate", "orientation.set",
  "source.add", "source.update", "source.rename", "source.options", "source.pickImage",
  "item.set", "item.move", "item.remove", "item.select", "item.sizes",
  "audio.volume", "audio.mute", "audio.monitor", "filters.set",
  "display.bounds", "display.hide", "display.area", "canvas.get", "settings.get", "settings.setEncoder",
  "chat.send", "chat.delete", "chat.ban", "quit.confirm", "quit.cancel",
]);
const EVENTS = new Set(["account", "engine", "link.code", "broadcast", "stats", "volmeter", "scenes", "chat", "room", "quit.ask"]);

const studio = {
  invoke: (channel: string, ...args: unknown[]): Promise<any> => {
    if (!INVOKE.has(channel)) return Promise.reject(new Error("channel"));
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (event: string, cb: (payload: any) => void): (() => void) => {
    if (!EVENTS.has(event)) return () => {};
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
  locale: (): Promise<string> => ipcRenderer.invoke("app.locale"),
};

contextBridge.exposeInMainWorld("studio", studio);

export type StudioBridge = typeof studio;
