export type ItemModel = { x: number; y: number; scaleX: number; scaleY: number; crop?: { left: number; right: number; top: number; bottom: number }; rotation?: number; flipH?: boolean; flipV?: boolean };
export type ObsTransform = { alignment: "topLeft" | "center"; position: { x: number; y: number }; scale: { x: number; y: number }; rotation: number; crop: { left: number; right: number; top: number; bottom: number } };
export function normRotation(r: unknown): 0 | 90 | 180 | 270;
export function isOriented(item: ItemModel): boolean;
export function obsTransform(item: ItemModel, size: { width: number; height: number }): ObsTransform;
