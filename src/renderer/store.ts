import { useEffect, useState, useSyncExternalStore } from "react";

/** Nilai dari proses utama: diambil sekali lewat `invoke`, lalu diperbarui oleh event. */
export function useMainState<T>(event: string, initialChannel: string | null, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    let alive = true;
    if (initialChannel)
      void window.studio.invoke<T>(initialChannel).then((v) => {
        if (alive && v !== undefined && v !== null) setValue(v);
      });
    const off = window.studio.on<T>(event, (v) => setValue(v));
    return () => {
      alive = false;
      off();
    };
  }, [event, initialChannel]);
  return value;
}

/*
  Lapisan di atas pratinjau. Tampilan OBS adalah jendela native yang selalu menutupi DOM di area
  pratinjau, jadi selama ada dialog/menu terbuka pratinjau disembunyikan, lalu dipasang lagi.
*/
let overlays = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const overlayStore = {
  open() {
    overlays++;
    emit();
  },
  close() {
    overlays = Math.max(0, overlays - 1);
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  count: () => overlays,
};
export const useOverlayCount = () => useSyncExternalStore(overlayStore.subscribe, overlayStore.count);

export type Result<T = unknown> = { ok: true; value: T } | { ok: false; code: string };

/*
  Dialog sumber (pengaturan / filter) yang dibuka dari daftar sumber ATAU dari menu klik kanan di pratinjau.
  Dirender oleh panel Sumber.
*/
export type SourceDialog = { type: "edit" | "filters"; sourceId: string } | null;
let sourceDialog: SourceDialog = null;
const dialogListeners = new Set<() => void>();
export const sourceDialogStore = {
  open(next: SourceDialog) {
    sourceDialog = next;
    dialogListeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    dialogListeners.add(l);
    return () => dialogListeners.delete(l);
  },
  get: () => sourceDialog,
};
export const useSourceDialog = () => useSyncExternalStore(sourceDialogStore.subscribe, sourceDialogStore.get);
