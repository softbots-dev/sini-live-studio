import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Renderer Sini Live Studio: halaman lokal (file://) — base relatif, tanpa server luar.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../dist/renderer", emptyOutDir: true, target: "chrome140" },
});
