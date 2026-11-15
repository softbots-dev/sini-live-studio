/*
  Geometri item di pratinjau, dalam koordinat KANVAS (bukan piksel layar). Perilaku meniru OBS:
  - 8 pegangan (nw n ne e se s sw w): sudut menjaga rasio (free = Shift → dua sumbu bebas), sisi meregangkan
    satu sumbu; sisi/sudut seberang tetap di tempat.
  - Potong (Alt + seret pegangan, atau mode potong): memotong sisi itu dalam piksel sumber; isi yang tersisa
    tidak bergeser.
  - Putar (kelipatan 90°, searah jarum jam) & cermin: model menyimpan KOTAK TERLIHAT (x, y = kiri atas);
    pada 90/270 lebar & tinggi kotak tertukar. Pegangan selalu bekerja pada sisi yang TERLIHAT — dipetakan
    ke sisi sumber lewat SIDE_OF.
  - Preset: pas/regangkan/tengahkan/atur ulang + rata kiri/kanan/atas/bawah, tengah satu sumbu.
  Murni — diuji test/transform.test.mjs.
*/

const ZERO = { left: 0, right: 0, top: 0, bottom: 0 };
const cropOf = (item) => ({ ...ZERO, ...(item.crop ?? {}) });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rotOf = (item) => {
  const r = (((Math.round((item.rotation ?? 0) / 90) * 90) % 360) + 360) % 360;
  return r;
};
const swapped = (item) => rotOf(item) === 90 || rotOf(item) === 270;

/** Ukuran sumber yang tersisa setelah dipotong (piksel sumber, minimal 1). */
function visible(item, size) {
  const c = cropOf(item);
  return { cw: Math.max(1, size.width - c.left - c.right), ch: Math.max(1, size.height - c.top - c.bottom) };
}
/** Ukuran kotak terlihat tanpa skala (piksel sumber, setelah putar). */
function seen(item, size) {
  const { cw, ch } = visible(item, size);
  return swapped(item) ? { vw: ch, vh: cw } : { vw: cw, vh: ch };
}
/** Skala sumber dari ukuran kotak terlihat w×h. */
function scalesFor(item, size, w, h) {
  const { cw, ch } = visible(item, size);
  return swapped(item) ? { scaleX: h / cw, scaleY: w / ch } : { scaleX: w / cw, scaleY: h / ch };
}

/*
  Sisi terlihat (n/e/s/w) → sisi sumber (sebelum cermin), per rotasi searah jarum jam. Contoh 90°: sisi
  KIRI sumber berputar ke atas, jadi pegangan atas terlihat memotong sisi kiri sumber.
*/
const SIDE_OF = {
  0: { n: "top", e: "right", s: "bottom", w: "left" },
  90: { n: "left", e: "top", s: "right", w: "bottom" },
  180: { n: "bottom", e: "left", s: "top", w: "right" },
  270: { n: "right", e: "bottom", s: "left", w: "top" },
};
const MIRROR = { left: "right", right: "left", top: "bottom", bottom: "top" };
function sourceSide(item, visibleSide) {
  let side = SIDE_OF[rotOf(item)][visibleSide];
  if (item.flipH && (side === "left" || side === "right")) side = MIRROR[side];
  if (item.flipV && (side === "top" || side === "bottom")) side = MIRROR[side];
  return side;
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
  const sw = Math.max(0, size.width - c.left - c.right) * item.scaleX;
  const sh = Math.max(0, size.height - c.top - c.bottom) * item.scaleY;
  return swapped(item) ? { x: item.x, y: item.y, w: sh, h: sw } : { x: item.x, y: item.y, w: sw, h: sh };
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
    ...scalesFor(item, size, w, h),
  };
}

export function cropItem({ item, size, handle, dx, dy }) {
  const c = cropOf(item);
  const next = { ...c };
  let { x, y } = item;
  const apply = (visibleSide, inward) => {
    const side = sourceSide(item, visibleSide);
    const horizontal = side === "left" || side === "right";
    const scale = horizontal ? item.scaleX : item.scaleY;
    const total = horizontal ? size.width : size.height;
    const other = { left: "right", right: "left", top: "bottom", bottom: "top" }[side];
    next[side] = Math.round(clamp(c[side] + inward / scale, 0, total - c[other] - 1));
    return (next[side] - c[side]) * scale; // pergeseran sisi terlihat (satuan kanvas)
  };
  if (handle.includes("w")) x = item.x + apply("w", dx);
  else if (handle.includes("e")) apply("e", -dx);
  if (handle.includes("n")) y = item.y + apply("n", dy);
  else if (handle.includes("s")) apply("s", -dy);
  return { x, y, crop: next };
}

/** Patch item untuk preset. "center" & rata tidak mengubah skala. */
export function presetTransform(preset, item, size, canvas) {
  const { vw, vh } = seen(item, size);
  const b = itemBox(item, size);
  switch (preset) {
    case "fit": {
      const s = Math.min(canvas.width / vw, canvas.height / vh);
      return { x: Math.round((canvas.width - vw * s) / 2), y: Math.round((canvas.height - vh * s) / 2), scaleX: s, scaleY: s };
    }
    case "stretch":
      return { x: 0, y: 0, ...scalesFor(item, size, canvas.width, canvas.height) };
    case "center":
      return { x: Math.round((canvas.width - b.w) / 2), y: Math.round((canvas.height - b.h) / 2) };
    case "centerH":
      return { x: Math.round((canvas.width - b.w) / 2) };
    case "centerV":
      return { y: Math.round((canvas.height - b.h) / 2) };
    case "left":
      return { x: 0 };
    case "right":
      return { x: Math.round(canvas.width - b.w) };
    case "top":
      return { y: 0 };
    case "bottom":
      return { y: Math.round(canvas.height - b.h) };
    default:
      return { x: 0, y: 0, scaleX: 1, scaleY: 1, crop: { ...ZERO } };
  }
}

/** Putar +90° searah jarum jam; pusat kotak terlihat tetap. */
export function rotateItem(item, size) {
  const b = itemBox(item, size);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return { rotation: (rotOf(item) + 90) % 360, x: cx - b.h / 2, y: cy - b.w / 2 };
}

/** Cermin horizontal ("h") / vertikal ("v"); kotak tidak bergeser. */
export function flipItem(item, axis) {
  return axis === "h" ? { flipH: !item.flipH } : { flipV: !item.flipV };
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
