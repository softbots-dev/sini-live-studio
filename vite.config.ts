import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Renderer Sini Live Studio: halaman lokal (file://) — base relatif, tanpa server luar.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  // Dua halaman: aplikasi (index.html) dan widget di layar siaran (widget.html, disajikan server widget lokal).
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    target: "chrome140",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./src/renderer/index.html", import.meta.url)),
        widget: fileURLToPath(new URL("./src/renderer/widget.html", import.meta.url)),
      },
    },
  },
});
