import { useCallback, useEffect, useRef, useState } from "react";
import type { Collection, Item, Scene } from "../screens/Studio";
import { useT } from "../i18n";
import { useOverlayCount } from "../store";

type Area = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };
type Drag = { itemId: string; mode: "move" | "scale"; startX: number; startY: number; item: Item; size: Size };

const HANDLE = 24; // piksel kanvas di sekitar sudut kanan bawah untuk mengubah ukuran

/*
  Pratinjau: libobs menggambar kanvas di jendela native tepat di atas elemen ini. Mouse ditangani di
  elemen ini (jendela native tidak menelan klik), dipetakan ke koordinat kanvas: seret = pindah,
  sudut kanan bawah = ubah ukuran (proporsional). Garis seleksi digambar libobs.
*/
export function PreviewPanel({ collection, scene, selected, onSelect }: { collection: Collection | null; scene: Scene | null; selected: string | null; onSelect: (id: string | null) => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [canvas, setCanvas] = useState<Size>({ width: 1920, height: 1080 });
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const drag = useRef<Drag | null>(null);
  const pending = useRef<{ id: string; patch: Record<string, number> } | null>(null);
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

  useEffect(() => {
    void window.studio.invoke<Size>("canvas.get").then(setCanvas);
    void window.studio.invoke<Record<string, Size>>("item.sizes").then(setSizes);
    // Ukuran sumber bisa berubah (kamera baru menyala, jendela diubah) — ambil ulang berkala.
    const timer = setInterval(() => void window.studio.invoke<Record<string, Size>>("item.sizes").then(setSizes), 2000);
    return () => clearInterval(timer);
  }, [collection]);

  const toCanvas = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !area || area.width <= 0) return null;
    const r = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (e.clientX - r.left) * dpr - area.x;
    const py = (e.clientY - r.top) * dpr - area.y;
    return { x: (px / area.width) * canvas.width, y: (py / area.height) * canvas.height };
  };

  const box = (item: Item) => {
    const s = sizes[item.id];
    if (!s) return null;
    const c = item.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
    return { x: item.x, y: item.y, w: Math.max(0, s.width - c.left - c.right) * item.scaleX, h: Math.max(0, s.height - c.top - c.bottom) * item.scaleY, size: s };
  };

  const flush = () => {
    const p = pending.current;
    pending.current = null;
    if (p) void window.studio.invoke("item.set", p.id, p.patch);
  };

  const onDown = (e: React.PointerEvent) => {
    if (!scene) return;
    const pt = toCanvas(e);
    if (!pt) return;
    const hit = [...scene.items].reverse().find((item) => {
      const b = box(item);
      return item.visible && b && pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
    });
    onSelect(hit?.id ?? null);
    void window.studio.invoke("item.select", hit?.id ?? null);
    if (!hit || hit.locked) return;
    const b = box(hit)!;
    const corner = pt.x >= b.x + b.w - HANDLE && pt.y >= b.y + b.h - HANDLE;
    drag.current = { itemId: hit.id, mode: corner ? "scale" : "move", startX: pt.x, startY: pt.y, item: hit, size: b.size };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const pt = toCanvas(e);
    if (!pt) return;
    let patch: Record<string, number>;
    if (d.mode === "move") {
      patch = { x: Math.round(d.item.x + pt.x - d.startX), y: Math.round(d.item.y + pt.y - d.startY) };
    } else {
      const c = d.item.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
      const baseW = Math.max(1, (d.size.width - c.left - c.right) * d.item.scaleX);
      const ratio = Math.max(0.05, (baseW + pt.x - d.startX) / baseW);
      patch = { scaleX: d.item.scaleX * ratio, scaleY: d.item.scaleY * ratio };
    }
    const first = pending.current === null;
    pending.current = { id: d.itemId, patch };
    if (first) requestAnimationFrame(flush);
  };

  const onUp = () => {
    drag.current = null;
    flush();
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
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
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
