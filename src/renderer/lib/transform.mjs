/*
  Geometri item di pratinjau, dalam koordinat KANVAS (bukan piksel layar). Perilaku meniru OBS:
  - 8 pegangan (nw n ne e se s sw w): sudut menjaga rasio (free = Shift → dua sumbu bebas), sisi meregangkan
    satu sumbu; sisi/sudut seberang tetap di tempat.
  - Potong (Alt + seret pegangan): memotong sisi itu dalam piksel sumber; isi yang tersisa tidak bergeser.
  - Preset menu klik kanan: pas ke layar, regangkan ke layar, tengahkan, atur ulang.
  Murni — diuji test/transform.test.mjs.
*/

const ZERO = { left: 0, right: 0, top: 0, bottom: 0 };
const cropOf = (item) => ({ ...ZERO, ...(item.crop ?? {}) });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Ukuran sumber yang tersisa setelah dipotong (piksel sumber, minimal 1). */
function visible(item, size) {
  const c = cropOf(item);
  return { cw: Math.max(1, size.width - c.left - c.right), ch: Math.max(1, size.height - c.top - c.bottom) };
}

export const CURSORS = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  body: "move",
};

export function itemBox(item, size) {
  const c = cropOf(item);
  return {
    x: item.x,
    y: item.y,
    w: Math.max(0, size.width - c.left - c.right) * item.scaleX,
    h: Math.max(0, size.height - c.top - c.bottom) * item.scaleY,
  };
}

/** Pegangan di bawah titik (toleransi `tol` satuan kanvas), "body", atau null. */
export function hitTest(b, pt, tol) {
  const right = b.x + b.w;
  const bottom = b.y + b.h;
  if (pt.x < b.x - tol || pt.x > right + tol || pt.y < b.y - tol || pt.y > bottom + tol) return null;
  const l = Math.abs(pt.x - b.x) <= tol;
  const r = Math.abs(pt.x - right) <= tol;
  const t = Math.abs(pt.y - b.y) <= tol;
  const btm = Math.abs(pt.y - bottom) <= tol;
  if (t && l) return "nw";
  if (t && r) return "ne";
  if (btm && l) return "sw";
  if (btm && r) return "se";
  if (t) return "n";
  if (btm) return "s";
  if (l) return "w";
  if (r) return "e";
  return pt.x >= b.x && pt.x <= right && pt.y >= b.y && pt.y <= bottom ? "body" : null;
}

export function resizeItem({ item, size, handle, dx, dy, free }) {
  const { cw, ch } = visible(item, size);
  const b = itemBox(item, size);
  const hasW = handle.includes("w");
  const hasE = handle.includes("e");
  const hasN = handle.includes("n");
  const hasS = handle.includes("s");
  let w = b.w + (hasE ? dx : hasW ? -dx : 0);
  let h = b.h + (hasS ? dy : hasN ? -dy : 0);
  if ((hasW || hasE) && (hasN || hasS) && !free && b.w > 0 && b.h > 0) {
    // Sudut: satu faktor untuk dua sumbu — ikuti sumbu yang paling banyak berubah.
    const kx = w / b.w;
    const ky = h / b.h;
    const k = Math.max(Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky, 1 / b.w, 1 / b.h);
    w = b.w * k;
    h = b.h * k;
  }
  w = Math.max(1, w);
  h = Math.max(1, h);
  return {
    x: hasW ? b.x + b.w - w : b.x,
    y: hasN ? b.y + b.h - h : b.y,
    scaleX: w / cw,
    scaleY: h / ch,
  };
}

export function cropItem({ item, size, handle, dx, dy }) {
  const c = cropOf(item);
  const sx = dx / item.scaleX;
  const sy = dy / item.scaleY;
  const next = { ...c };
  let { x, y } = item;
  if (handle.includes("w")) {
    next.left = Math.round(clamp(c.left + sx, 0, size.width - c.right - 1));
    x = item.x + (next.left - c.left) * item.scaleX;
  } else if (handle.includes("e")) {
    next.right = Math.round(clamp(c.right - sx, 0, size.width - c.left - 1));
  }
  if (handle.includes("n")) {
    next.top = Math.round(clamp(c.top + sy, 0, size.height - c.bottom - 1));
    y = item.y + (next.top - c.top) * item.scaleY;
  } else if (handle.includes("s")) {
    next.bottom = Math.round(clamp(c.bottom - sy, 0, size.height - c.top - 1));
  }
  return { x, y, crop: next };
}

/** Patch item untuk preset menu klik kanan. "center" tidak mengubah skala. */
export function presetTransform(preset, item, size, canvas) {
  const { cw, ch } = visible(item, size);
  if (preset === "fit") {
    const s = Math.min(canvas.width / cw, canvas.height / ch);
    return { x: Math.round((canvas.width - cw * s) / 2), y: Math.round((canvas.height - ch * s) / 2), scaleX: s, scaleY: s };
  }
  if (preset === "stretch") return { x: 0, y: 0, scaleX: canvas.width / cw, scaleY: canvas.height / ch };
  if (preset === "center") {
    const b = itemBox(item, size);
    return { x: Math.round((canvas.width - b.w) / 2), y: Math.round((canvas.height - b.h) / 2) };
  }
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, crop: { ...ZERO } };
}

/**
 * Bingkai lapisan seleksi dalam piksel CSS relatif elemen pratinjau, plus garis jarak dari tengah tiap sisi
 * ke tepi kanvas (label = jarak dalam piksel kanvas, seperti studio siaran lain). `area` = kotak kanvas di
 * dalam elemen pratinjau (piksel CSS).
 */
export function selectionFrame(box, canvas, area) {
  const k = area.width / canvas.width;
  const bx = area.x + box.x * k;
  const by = area.y + box.y * k;
  const bw = box.w * k;
  const bh = box.h * k;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const guides = [];
  const inX = cx > area.x && cx < right;
  const inY = cy > area.y && cy < bottom;
  const left = Math.round(box.x);
  const rightGap = Math.round(canvas.width - (box.x + box.w));
  const top = Math.round(box.y);
  const bottomGap = Math.round(canvas.height - (box.y + box.h));
  if (inY && left > 0) guides.push({ side: "left", x1: area.x, y1: cy, x2: bx, y2: cy, label: left });
  if (inY && rightGap > 0) guides.push({ side: "right", x1: bx + bw, y1: cy, x2: right, y2: cy, label: rightGap });
  if (inX && top > 0) guides.push({ side: "top", x1: cx, y1: area.y, x2: cx, y2: by, label: top });
  if (inX && bottomGap > 0) guides.push({ side: "bottom", x1: cx, y1: by + bh, x2: cx, y2: bottom, label: bottomGap });
  return { box: { x: bx, y: by, w: bw, h: bh }, guides };
}
