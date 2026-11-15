import { useCallback, useEffect, useRef, useState } from "react";
import type { Collection, Item, Scene } from "../screens/Studio";
import { useT } from "../i18n";
import { useOverlayCount } from "../store";
import { openItemMenu } from "../item-menu";
import { CURSORS, cropItem, hitTest, itemBox, resizeItem, selectionFrame, type Handle, type Hit } from "../lib/transform.mjs";

type Area = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };
type Drag = { itemId: string; mode: "move" | "resize" | "crop"; handle: Handle | null; startX: number; startY: number; item: Item; size: Size };

/** Jarak tangkap pegangan, dalam piksel layar (CSS). */
const GRAB_PX = 8;

/*
  Pratinjau: libobs menggambar kanvas di jendela native tepat di atas elemen ini. Mouse ditangani di
  elemen ini (jendela native tidak menelan klik), dipetakan ke koordinat kanvas. Seperti OBS:
  seret badan = pindah; 8 pegangan item terpilih = ubah ukuran (sudut menjaga rasio, Shift = bebas;
  sisi = satu sumbu); Alt + pegangan (atau mode potong di toolbar) = potong; klik kanan = menu item. Bingkai seleksi digambar lapisan transparan (src/main/overlay.ts).
*/
export function PreviewPanel({ collection, scene, selected, onSelect, cropMode = false }: { collection: Collection | null; scene: Scene | null; selected: string | null; onSelect: (id: string | null) => void; cropMode?: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [canvas, setCanvas] = useState<Size>({ width: 1920, height: 1080 });
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [cursor, setCursor] = useState<string>("default");
  const drag = useRef<Drag | null>(null);
  const pending = useRef<{ id: string; patch: Record<string, unknown> } | null>(null);
  const overlays = useOverlayCount();

  const sendBounds = useCallback(async () => {
    const el = ref.current;
    if (!el || overlays > 0) return;
    const r = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const next = await window.studio.invoke<Area | null>("display.bounds", { x: r.left * dpr, y: r.top * dpr, width: r.width * dpr, height: r.height * dpr });
    setArea(next);
  }, [overlays]);

  useEffect(() => {
    if (overlays > 0) {
      void window.studio.invoke("display.hide");
      return;
    }
    void sendBounds();
    const ro = new ResizeObserver(() => void sendBounds());
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("resize", sendBounds);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sendBounds);
    };
  }, [overlays, sendBounds]);

  // Pratinjau dilepas (keluar akun, layar lain) → jendela native & lapisan seleksi disembunyikan, kalau
  // tidak keduanya tetap menutupi halaman sebagai kotak hitam.
  useEffect(() => () => void window.studio.invoke("display.hide"), []);

  /** Bingkai seleksi (lapisan di atas pratinjau native) untuk item terpilih; `live` = posisi saat diseret. */
  const drawSelection = (live?: { id: string; patch: Record<string, unknown> }) => {
    const el = ref.current;
    const item = scene?.items.find((i) => i.id === selected);
    const size = item ? sizes[item.id] : undefined;
    if (!el || !area || overlays > 0 || !item || !item.visible || !size) {
      void window.studio.invoke("overlay.draw", null);
      return;
    }
    const geom = live && live.id === item.id ? { ...item, ...live.patch } : item;
    const dpr = window.devicePixelRatio || 1;
    const r = el.getBoundingClientRect();
    const frame = selectionFrame(itemBox(geom as Item, size), canvas, { x: area.x / dpr, y: area.y / dpr, width: area.width / dpr, height: area.height / dpr });
    void window.studio.invoke("overlay.draw", { rect: { x: r.left, y: r.top, width: r.width, height: r.height }, box: frame.box, guides: frame.guides, locked: item.locked });
  };
  useEffect(() => {
    drawSelection();
  });
  useEffect(() => () => void window.studio.invoke("overlay.draw", null), []);

  useEffect(() => {
    void window.studio.invoke<Size>("canvas.get").then(setCanvas);
    void window.studio.invoke<Record<string, Size>>("item.sizes").then(setSizes);
    // Ukuran sumber bisa berubah (kamera baru menyala, jendela diubah) — ambil ulang berkala.
    const timer = setInterval(() => void window.studio.invoke<Record<string, Size>>("item.sizes").then(setSizes), 2000);
    return () => clearInterval(timer);
  }, [collection]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const el = ref.current;
    if (!el || !area || area.width <= 0) return null;
    const r = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (e.clientX - r.left) * dpr - area.x;
    const py = (e.clientY - r.top) * dpr - area.y;
    return { x: (px / area.width) * canvas.width, y: (py / area.height) * canvas.height };
  };
  /** Jarak tangkap pegangan dalam satuan kanvas. */
  const tolerance = () => (area && area.width > 0 ? (GRAB_PX * (window.devicePixelRatio || 1) * canvas.width) / area.width : 16);

  const boxOf = (item: Item) => {
    const s = sizes[item.id];
    return s ? itemBox(item, s) : null;
  };

  /** Pegangan item terpilih lebih dulu (seperti OBS), lalu badan item teratas di bawah titik. */
  const pick = (pt: { x: number; y: number }): { item: Item; hit: Hit } | null => {
    if (!scene) return null;
    const tol = tolerance();
    const current = scene.items.find((i) => i.id === selected);
    if (current?.visible) {
      const b = boxOf(current);
      const hit = b ? hitTest(b, pt, tol) : null;
      if (hit && hit !== "body") return { item: current, hit };
    }
    for (const item of [...scene.items].reverse()) {
      const b = item.visible ? boxOf(item) : null;
      if (b && hitTest(b, pt, 0) === "body") return { item, hit: "body" };
    }
    return null;
  };

  const flush = () => {
    const p = pending.current;
    pending.current = null;
    if (p) {
      drawSelection(p);
      void window.studio.invoke("item.set", p.id, p.patch);
    }
  };

  const select = (id: string | null) => {
    onSelect(id);
    void window.studio.invoke("item.select", id);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // klik kanan → onContextMenu
    const pt = toCanvas(e);
    if (!pt) return;
    const found = pick(pt);
    select(found?.item.id ?? null);
    if (!found || found.item.locked) return;
    const size = sizes[found.item.id];
    if (!size) return;
    const handle = found.hit === "body" ? null : found.hit;
    drag.current = { itemId: found.item.id, mode: handle ? (e.altKey || cropMode ? "crop" : "resize") : "move", handle, startX: pt.x, startY: pt.y, item: found.item, size };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const pt = toCanvas(e);
    if (!pt) return;
    const d = drag.current;
    if (!d) {
      const found = pick(pt);
      setCursor(found && !found.item.locked ? CURSORS[found.hit] : "default");
      return;
    }
    const dx = pt.x - d.startX;
    const dy = pt.y - d.startY;
    let patch: Record<string, unknown>;
    if (d.mode === "move") patch = { x: Math.round(d.item.x + dx), y: Math.round(d.item.y + dy) };
    else if (d.mode === "crop" && d.handle) patch = cropItem({ item: d.item, size: d.size, handle: d.handle, dx, dy });
    else patch = resizeItem({ item: d.item, size: d.size, handle: d.handle!, dx, dy, free: e.shiftKey });
    const first = pending.current === null;
    pending.current = { id: d.itemId, patch };
    if (first) requestAnimationFrame(flush);
  };

  const onUp = () => {
    drag.current = null;
    flush();
  };

  const onContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!scene || !collection) return;
    const pt = toCanvas(e);
    const found = pt ? pick(pt) : null;
    select(found?.item.id ?? null);
    if (!found) return;
    const source = collection.sources.find((s) => s.id === found.item.sourceId);
    if (!source) return;
    if (await openItemMenu({ t, item: found.item, scene, source, size: sizes[found.item.id] ?? null, canvas })) select(null);
  };

  const selectedItem = scene?.items.find((i) => i.id === selected);
  return (
    <div className="preview-wrap">
      <div
        ref={ref}
        className={`preview ${collection?.orientation === "portrait" ? "is-portrait" : ""}`}
        role="img"
        aria-label={t("studio.app.preview")}
        tabIndex={0}
        style={{ cursor }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => !drag.current && setCursor("default")}
        onContextMenu={(e) => void onContextMenu(e)}
        onKeyDown={(e) => {
          // Panah = geser item terpilih 1 px (Shift = 10 px).
          if (!selectedItem || selectedItem.locked) return;
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          if (!dx && !dy) return;
          e.preventDefault();
          void window.studio.invoke("item.set", selectedItem.id, { x: selectedItem.x + dx, y: selectedItem.y + dy });
        }}
      />
    </div>
  );
}
