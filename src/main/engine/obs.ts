import { createRequire } from "node:module";
import { dirname } from "node:path";
import * as osn from "obs-studio-node";
import { encoderSettings, fitProfile, pickEncoder } from "./encoder.mjs";
import { MAX_ITEMS_PER_SCENE } from "./collection.mjs";
import { scrubLogDir } from "./log-scrub.mjs";

/*
  Pembungkus obs-studio-node (libobs) untuk Sini Live Studio. Berjalan di proses utama; pekerjaan berat
  (render, encode) ada di proses server OBS yang di-host lewat IPC.

  Kerahasiaan: layanan RTMP dibuat di memori saat siaran mulai dan dihancurkan saat berhenti —
  pengaturan layanan TIDAK pernah disimpan lewat OBS_settings_saveSettings. Log libobs disaring
  (`scrubLogDir`) saat siaran berhenti, saat init, dan saat shutdown.
*/

export interface Profile {
  width: number;
  height: number;
  fps: number;
  videoKbps: number;
  minVideoKbps?: number;
  maxVideoKbps?: number;
  keyframeSec?: number;
  audioKbps: number;
  sampleRate?: number;
  stereo?: boolean;
}

export interface OutputSignal {
  type: string;
  signal: string;
  code: number;
}

export interface EngineEvents {
  onOutput(signal: OutputSignal): void;
  onVolmeter(sourceId: string, peak: number[]): void;
}

export interface ItemTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  crop?: { left: number; right: number; top: number; bottom: number };
  visible?: boolean;
}

export interface Stats {
  kbps: number;
  droppedFrames: number;
  totalFrames: number;
  cpu: number;
  fps: number;
  encoder: string | null;
}

/** Jenis sumber yang ditawarkan studio (id libobs Windows). */
export const SOURCE_KINDS = [
  "dshow_input",
  "monitor_capture",
  "window_capture",
  "game_capture",
  "wasapi_input_capture",
  "wasapi_output_capture",
  "image_source",
  "text_gdiplus",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const FILTER_KINDS = [
  "color_filter",
  "crop_filter",
  "chroma_key_filter",
  "noise_suppress_filter",
  "noise_gate_filter",
  "gain_filter",
  "compressor_filter",
] as const;
export type FilterKind = (typeof FILTER_KINDS)[number];

const DISPLAY = "sini-preview";
const finite = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0);
const AUDIO_TRACK = 1;

class EngineError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "EngineError";
  }
}

export class ObsEngine {
  private ready = false;
  private appDataPath = "";
  private video: osn.IVideo | null = null;
  private canvas = { width: 1920, height: 1080 };
  private readonly sources = new Map<string, osn.IInput>();
  private readonly faders = new Map<string, osn.IFader>();
  private readonly volmeters = new Map<string, osn.IVolmeter>();
  private readonly scenes = new Map<string, osn.IScene>();
  /** sceneId → (itemKey → id item libobs) */
  private readonly items = new Map<string, Map<string, number>>();
  private stream: osn.IAdvancedStreaming | null = null;
  private service: osn.IService | null = null;
  private encoderId: string | null = null;
  private stopping = false;
  private secretKeys: string[] = [];
  private display = false;
  preferredEncoder: string | undefined;

  constructor(private readonly events: EngineEvents) {}

  init({ appDataPath, version, locale }: { appDataPath: string; version: string; locale: string }) {
    if (this.ready) return;
    this.appDataPath = appDataPath;
    scrubLogDir(appDataPath);
    const require = createRequire(import.meta.url);
    const workDir = dirname(require.resolve("obs-studio-node/package.json")).replace("app.asar", "app.asar.unpacked");
    osn.NodeObs.IPC.host(`sini-studio-${process.pid}`);
    osn.NodeObs.SetWorkingDirectory(workDir);
    const result = osn.NodeObs.OBS_API_initAPI({ language: locale, appDataPath, version, crashServerUrl: "" });
    if (result !== 0) {
      this.disconnect();
      throw new EngineError(`obs_init_${result}`);
    }
    this.video = osn.VideoFactory.create();
    this.setCanvas({ width: 1920, height: 1080, fps: 30, videoKbps: 6000, audioKbps: 160 });
    osn.NodeObs.RegisterVolmeterCallback((rows: { sourceName: string; peak: number[] }[]) => {
      for (const row of rows) this.events.onVolmeter(row.sourceName, row.peak);
    });
    this.ready = true;
  }

  private need(): osn.IVideo {
    if (!this.ready || !this.video) throw new EngineError("obs_not_ready");
    return this.video;
  }

  /** Kanvas (dasar) = orientasi siaran; keluaran boleh lebih kecil (x264 → 720p). */
  setCanvas(profile: Profile, output?: { width: number; height: number }) {
    const video = this.video;
    if (!video) return;
    this.canvas = { width: profile.width, height: profile.height };
    video.video = {
      fpsNum: profile.fps,
      fpsDen: 1,
      baseWidth: profile.width,
      baseHeight: profile.height,
      outputWidth: output?.width ?? profile.width,
      outputHeight: output?.height ?? profile.height,
      outputFormat: osn.EVideoFormat.NV12,
      colorspace: osn.EColorSpace.CS709,
      range: osn.ERangeType.Partial,
      scaleType: osn.EScaleType.Bicubic,
      fpsType: osn.EFPSType.Integer,
    };
  }

  canvasSize() {
    return { ...this.canvas };
  }

  encoders(): string[] {
    this.need();
    return osn.VideoEncoderFactory.types();
  }

  // ── Sumber ────────────────────────────────────────────────────────────────

  createSource(id: string, kind: SourceKind, settings: Record<string, unknown> = {}) {
    this.need();
    if (!SOURCE_KINDS.includes(kind)) throw new EngineError("source_kind");
    if (this.sources.has(id)) return;
    const input = osn.InputFactory.create(kind, id, settings);
    this.sources.set(id, input);
    if (kind === "wasapi_input_capture" || kind === "wasapi_output_capture" || kind === "dshow_input") {
      const fader = osn.FaderFactory.create(osn.EFaderType.IEC);
      fader.attach(input);
      this.faders.set(id, fader);
      const meter = osn.VolmeterFactory.create(osn.EFaderType.IEC);
      meter.attach(input);
      this.volmeters.set(id, meter);
    }
  }

  updateSource(id: string, settings: Record<string, unknown>) {
    this.source(id).update(settings);
  }

  /** Pilihan daftar sebuah properti sumber (mis. perangkat kamera `video_device_id`, jendela `window`). */
  sourceOptions(id: string, property: string): { name: string; value: string | number }[] {
    const props = this.source(id).properties;
    const prop = props?.get(property) as osn.IListProperty | undefined;
    return prop?.details?.items?.map((i) => ({ name: i.name, value: i.value })) ?? [];
  }

  removeSource(id: string) {
    const input = this.sources.get(id);
    if (!input) return;
    this.volmeters.get(id)?.destroy();
    this.faders.get(id)?.destroy();
    this.volmeters.delete(id);
    this.faders.delete(id);
    for (const [sceneId, map] of this.items) {
      for (const [key] of [...map].filter(([, v]) => this.scenes.get(sceneId)?.findItem(v)?.source.name === id)) this.removeItem(sceneId, key);
    }
    input.release();
    this.sources.delete(id);
  }

  setVolume(id: string, mul: number) {
    const fader = this.faders.get(id);
    if (fader) fader.mul = Math.max(0, Math.min(1, mul));
  }

  setMuted(id: string, muted: boolean) {
    this.source(id).muted = muted;
  }

  setMonitoring(id: string, mode: "none" | "monitor" | "monitorAndOutput") {
    this.source(id).monitoringType = mode === "monitor" ? osn.EMonitoringType.MonitoringOnly : mode === "monitorAndOutput" ? osn.EMonitoringType.MonitoringAndOutput : osn.EMonitoringType.None;
  }

  /** Mengganti seluruh filter sumber sesuai urutan. */
  setFilters(id: string, filters: { kind: FilterKind; settings?: Record<string, unknown> }[]) {
    const input = this.source(id);
    for (const f of input.filters) {
      input.removeFilter(f);
      f.release();
    }
    filters.forEach((f, i) => {
      if (!FILTER_KINDS.includes(f.kind)) return;
      input.addFilter(osn.FilterFactory.create(f.kind, `${id}:${i}:${f.kind}`, f.settings ?? {}));
    });
  }

  private source(id: string): osn.IInput {
    this.need();
    const input = this.sources.get(id);
    if (!input) throw new EngineError("source_missing");
    return input;
  }

  // ── Scene & item ──────────────────────────────────────────────────────────

  createScene(id: string) {
    this.need();
    if (this.scenes.has(id)) return;
    this.scenes.set(id, osn.SceneFactory.create(id));
    this.items.set(id, new Map());
  }

  removeScene(id: string) {
    const scene = this.scenes.get(id);
    if (!scene) return;
    scene.release();
    this.scenes.delete(id);
    this.items.delete(id);
  }

  setActiveScene(id: string) {
    const scene = this.scenes.get(id);
    if (!scene) throw new EngineError("scene_missing");
    osn.Global.setOutputSource(0, scene);
  }

  addItem(sceneId: string, itemKey: string, sourceId: string, transform?: ItemTransform) {
    const scene = this.scenes.get(sceneId);
    const map = this.items.get(sceneId);
    if (!scene || !map) throw new EngineError("scene_missing");
    if (map.size >= MAX_ITEMS_PER_SCENE) throw new EngineError("scene_full");
    const t = transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    // Dengan kanvas, libobs mewajibkan transform awal lengkap.
    const info: osn.ISceneItemInfo = {
      name: itemKey,
      crop: { left: t.crop?.left ?? 0, right: t.crop?.right ?? 0, top: t.crop?.top ?? 0, bottom: t.crop?.bottom ?? 0 },
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      visible: t.visible ?? true,
      x: t.x,
      y: t.y,
      rotation: 0,
      streamVisible: true,
      recordingVisible: true,
      scaleFilter: osn.EScaleType.Bicubic,
      blendingMode: osn.EBlendingMode.Normal,
      blendingMethod: osn.EBlendingMethod.Default,
    };
    const item = scene.add(this.source(sourceId), info, this.video ?? undefined);
    map.set(itemKey, item.id);
  }

  private item(sceneId: string, itemKey: string): osn.ISceneItem {
    const id = this.items.get(sceneId)?.get(itemKey);
    const item = id === undefined ? undefined : this.scenes.get(sceneId)?.findItem(id);
    if (!item) throw new EngineError("item_missing");
    return item;
  }

  setItem(sceneId: string, itemKey: string, t: ItemTransform) {
    const item = this.item(sceneId, itemKey);
    item.deferUpdateBegin();
    item.position = { x: t.x, y: t.y };
    item.scale = { x: t.scaleX, y: t.scaleY };
    if (t.crop) item.crop = { ...t.crop };
    if (t.visible !== undefined) item.visible = t.visible;
    item.deferUpdateEnd();
  }

  /** Ukuran asli sumber item (untuk menghitung kotak di pratinjau). */
  itemSize(sceneId: string, itemKey: string) {
    const item = this.item(sceneId, itemKey);
    return { width: item.source.width, height: item.source.height };
  }

  removeItem(sceneId: string, itemKey: string) {
    const item = this.item(sceneId, itemKey);
    item.remove();
    this.items.get(sceneId)?.delete(itemKey);
  }

  /** Urutan lapisan: kunci item dari bawah ke atas. */
  orderItems(sceneId: string, keys: string[]) {
    const scene = this.scenes.get(sceneId);
    const map = this.items.get(sceneId);
    if (!scene || !map) return;
    keys.forEach((key, index) => {
      const id = map.get(key);
      if (id !== undefined) scene.findItem(id)?.move(index);
    });
  }

  selectItem(sceneId: string, itemKey: string | null) {
    const scene = this.scenes.get(sceneId);
    if (!scene) return;
    for (const item of scene.getItems()) item.selected = false;
    if (itemKey) this.item(sceneId, itemKey).selected = true;
  }

  // ── Pratinjau ─────────────────────────────────────────────────────────────

  attachDisplay(windowHandle: Buffer, bounds: { x: number; y: number; width: number; height: number }) {
    this.need();
    if (!this.display) {
      osn.NodeObs.OBS_content_createDisplay(windowHandle, DISPLAY, 0, false, this.video);
      osn.NodeObs.OBS_content_setPaddingColor(DISPLAY, 8, 7, 11);
      osn.NodeObs.OBS_content_setPaddingSize(DISPLAY, 0);
      osn.NodeObs.OBS_content_setShouldDrawUI(DISPLAY, true);
      this.display = true;
    }
    this.moveDisplay(bounds);
  }

  moveDisplay(b: { x: number; y: number; width: number; height: number }) {
    if (!this.display) return;
    osn.NodeObs.OBS_content_moveDisplay(DISPLAY, Math.round(b.x), Math.round(b.y));
    osn.NodeObs.OBS_content_resizeDisplay(DISPLAY, Math.max(1, Math.round(b.width)), Math.max(1, Math.round(b.height)));
  }

  destroyDisplay() {
    if (!this.display) return;
    osn.NodeObs.OBS_content_destroyDisplay(DISPLAY);
    this.display = false;
  }

  // ── Siaran ────────────────────────────────────────────────────────────────

  /** Mulai (atau mulai ulang) kirim. Alamat hanya dipegang selama siaran. */
  async startStream({ server, key, profile }: { server: string; key: string; profile: Profile }) {
    const video = this.need();
    this.teardownStream();
    const chosen = pickEncoder(this.encoders(), this.preferredEncoder);
    const fitted = fitProfile(profile, chosen.hardware) as Profile;
    this.setCanvas({ ...profile, width: this.canvas.width, height: this.canvas.height }, { width: fitted.width, height: fitted.height });

    this.secretKeys = [key];
    this.service = osn.ServiceFactory.create("rtmp_custom", "sini-service", { server, key, use_auth: false, bwtest: false });
    const stream = osn.AdvancedStreamingFactory.create();
    stream.service = this.service;
    stream.video = video;
    stream.videoEncoder = osn.VideoEncoderFactory.create(chosen.id, "sini-video", encoderSettings(chosen.id, fitted));
    osn.AudioTrackFactory.setAtIndex(osn.AudioTrackFactory.create(profile.audioKbps, "sini-audio"), AUDIO_TRACK);
    stream.audioTrack = AUDIO_TRACK;
    stream.enforceServiceBitrate = false;
    stream.enableTwitchVOD = false;
    const reconnect = osn.ReconnectFactory.create();
    reconnect.enabled = false; // sambung ulang diatur mesin status (broadcast-machine.mjs)
    stream.reconnect = reconnect;
    const delay = osn.DelayFactory.create();
    delay.enabled = false;
    stream.delay = delay;
    stream.network = osn.NetworkFactory.create();
    stream.signalHandler = (s: osn.EOutputSignal) => {
      if (this.stopping && s.signal === "stop") return;
      this.events.onOutput({ type: s.type, signal: s.signal, code: s.code });
    };
    this.stream = stream;
    this.encoderId = chosen.id;
    this.stopping = false;
    stream.start();
  }

  async stopStream() {
    this.teardownStream();
    scrubLogDir(this.appDataPath, this.secretKeys);
    this.secretKeys = [];
  }

  private teardownStream() {
    const stream = this.stream;
    if (stream) {
      this.stopping = true;
      try {
        stream.stop(true);
      } catch {
        // keluaran sudah berhenti
      }
      osn.AdvancedStreamingFactory.destroy(stream);
    }
    if (this.service) osn.ServiceFactory.destroy(this.service);
    this.stream = null;
    this.service = null;
    this.encoderId = null;
  }

  stats(): Stats {
    const s = this.stream;
    return {
      kbps: s ? Math.round(s.kbitsPerSec) : 0,
      droppedFrames: s?.droppedFrames ?? 0,
      totalFrames: s?.totalFrames ?? 0,
      cpu: this.ready ? finite(osn.Global.cpuPercentage) : 0,
      fps: this.ready ? finite(osn.Global.currentFrameRate) : 0,
      encoder: this.encoderId,
    };
  }

  shutdown() {
    if (!this.ready) return;
    this.teardownStream();
    this.destroyDisplay();
    for (const id of [...this.sources.keys()]) this.removeSource(id);
    for (const id of [...this.scenes.keys()]) this.removeScene(id);
    this.video?.destroy();
    this.video = null;
    this.disconnect();
    this.ready = false;
    scrubLogDir(this.appDataPath, this.secretKeys);
  }

  private disconnect() {
    try {
      osn.NodeObs.InitShutdownSequence();
    } catch {
      // abaikan
    }
    try {
      osn.NodeObs.IPC.disconnect();
    } catch {
      // abaikan
    }
  }
}
