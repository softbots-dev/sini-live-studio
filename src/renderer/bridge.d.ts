// Bentuk `window.studio` (studio/src/preload/index.cts). Renderer tidak mengimpor preload; jenis
// ini disalin dan dijaga sama oleh typecheck masing-masing sisi.
export interface StudioBridge {
  locale(): Promise<string>;
}

declare global {
  interface Window {
    studio: StudioBridge;
  }
}
