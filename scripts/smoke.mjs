// Uji asap mesin OBS di mesin Windows ini (tanpa siaran): init, encoder yang tersedia, tangkapan layar
// + mikrofon, ukuran item, statistik, shutdown. Jalankan: npm run smoke
import { app } from "electron";
import { join } from "node:path";
import { ObsEngine } from "../dist/main/engine/obs.js";

app.whenReady().then(async () => {
  const out = { meters: {} };
  const engine = new ObsEngine({ onOutput: () => {}, onVolmeter: (id, peak) => (out.meters[id] = peak.map((p) => Math.round(p))) });
  const t0 = Date.now();
  try {
    engine.init({ appDataPath: join(app.getPath("temp"), "sini-studio-smoke"), version: "smoke", locale: "en-US" });
    out.initMs = Date.now() - t0;
    out.encoders = engine.encoders();
    engine.createScene("s1");
    engine.createSource("screen", "monitor_capture", {});
    engine.createSource("mic", "wasapi_input_capture", { device_id: "default" });
    engine.addItem("s1", "i1", "screen", { x: 0, y: 0, scaleX: 1, scaleY: 1 });
    engine.setActiveScene("s1");
    await new Promise((r) => setTimeout(r, 2500));
    out.itemSize = engine.itemSize("s1", "i1");
    out.stats = engine.stats();
    out.monitors = engine.sourceOptions("screen", "monitor_id").length || engine.sourceOptions("screen", "monitor").length;
  } catch (err) {
    out.error = String(err?.message ?? err);
  }
  try {
    engine.shutdown();
  } catch (err) {
    out.shutdownError = String(err?.message ?? err);
  }
  console.log("SMOKE " + JSON.stringify(out));
  app.quit();
});
