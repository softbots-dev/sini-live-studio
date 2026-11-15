/*
  Model item (kotak TERLIHAT: x, y = kiri atas; putar kelipatan 90°; cermin) → transform scene item OBS.
  Item tanpa putar/cermin memakai acuan kiri atas — posisinya tidak bergantung ukuran sumber (perilaku
  lama). Item diputar/dicermin memakai acuan TENGAH di pusat kotak terlihat, cermin = skala negatif; posisi
  ini bergantung ukuran sumber, jadi scene-manager menerapkannya ulang saat ukuran berubah (reapplyOriented).
  Murni — diuji test/item-transform.test.mjs.
*/
const ZERO = { left: 0, right: 0, top: 0, bottom: 0 };

export const normRotation = (r) => ((((Math.round((Number(r) || 0) / 90) * 90) % 360) + 360) % 360);
export const isOriented = (item) => normRotation(item.rotation) !== 0 || Boolean(item.flipH) || Boolean(item.flipV);

export function obsTransform(item, size) {
  const crop = { ...ZERO, ...(item.crop ?? {}) };
  const rotation = normRotation(item.rotation);
  if (!isOriented(item)) {
    return { alignment: "topLeft", position: { x: item.x, y: item.y }, scale: { x: item.scaleX, y: item.scaleY }, rotation: 0, crop };
  }
  const sw = Math.max(0, size.width - crop.left - crop.right) * item.scaleX;
  const sh = Math.max(0, size.height - crop.top - crop.bottom) * item.scaleY;
  const [w, h] = rotation === 90 || rotation === 270 ? [sh, sw] : [sw, sh];
  return {
    alignment: "center",
    position: { x: item.x + w / 2, y: item.y + h / 2 },
    scale: { x: item.flipH ? -item.scaleX : item.scaleX, y: item.flipV ? -item.scaleY : item.scaleY },
    rotation,
    crop,
  };
}
