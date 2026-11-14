// Bentuk `window.studio` (studio/src/preload/index.cts). Renderer tidak mengimpor preload; jenis ini
// disalin. Daftar saluran yang diizinkan ada di preload.
export interface StudioBridge {
  invoke<T = any>(channel: string, ...args: unknown[]): Promise<T>;
  on<T = any>(event: string, cb: (payload: T) => void): () => void;
  locale(): Promise<string>;
}

declare global {
  interface Window {
    studio: StudioBridge;
  }
}
