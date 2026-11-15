export type Crop = { left: number; right: number; top: number; bottom: number };
export type ItemGeom = { x: number; y: number; scaleX: number; scaleY: number; crop?: Crop; rotation?: 0 | 90 | 180 | 270; flipH?: boolean; flipV?: boolean };
export type Size = { width: number; height: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type Hit = Handle | "body";
export type Preset = "fit" | "stretch" | "center" | "reset" | "centerH" | "centerV" | "left" | "right" | "top" | "bottom";

export const CURSORS: Record<Hit, string>;
export function itemBox(item: ItemGeom, size: Size): Box;
export function hitTest(b: Box, pt: { x: number; y: number }, tol: number): Hit | null;
export function resizeItem(o: { item: ItemGeom; size: Size; handle: Handle; dx: number; dy: number; free: boolean }): { x: number; y: number; scaleX: number; scaleY: number };
export function cropItem(o: { item: ItemGeom; size: Size; handle: Handle; dx: number; dy: number }): { x: number; y: number; crop: Crop };
export function presetTransform(preset: Preset, item: ItemGeom, size: Size, canvas: Size): Partial<ItemGeom>;
export type Guide = { side: "left" | "right" | "top" | "bottom"; x1: number; y1: number; x2: number; y2: number; label: number };
export function selectionFrame(box: Box, canvas: Size, area: { x: number; y: number; width: number; height: number }): { box: Box; guides: Guide[] };
export function rotateItem(item: ItemGeom, size: Size): { rotation: 0 | 90 | 180 | 270; x: number; y: number };
export function flipItem(item: ItemGeom, axis: "h" | "v"): { flipH?: boolean; flipV?: boolean };
type Oriented = { crop?: Crop; rotation?: number; flipH?: boolean; flipV?: boolean };
/** Potongan per sisi terlihat (isian angka) dari potongan per sisi sumber. */
export function visibleCrop(item: Oriented): Crop;
/** Isian per sisi terlihat → potongan per sisi sumber yang disimpan. */
export function sourceCrop(item: Oriented, visibleSides: Crop): Crop;
