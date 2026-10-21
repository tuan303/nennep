/** Pure drag-to-close rule of the bottom Sheet (unit-tested). */

/** Dragged at least this far (px)… */
export const SHEET_CLOSE_DISTANCE = 120;
/** …or a quick flick: at least this far (px) and this fast (px/ms). */
export const SHEET_FLICK_DISTANCE = 40;
export const SHEET_FLICK_VELOCITY = 0.6;

/**
 * What a released drag on the sheet header does: "close" asks the owner to close the sheet (it may still refuse,
 * e.g. while saving), "snap" springs the sheet back. A non-dismissible sheet (unsaved form, running import) always
 * snaps back.
 */
export function sheetDragOutcome(dy: number, elapsedMs: number, dismissible = true): "close" | "snap" {
  if (!dismissible) return "snap";
  const velocity = dy / Math.max(1, elapsedMs);
  return dy > SHEET_CLOSE_DISTANCE || (dy > SHEET_FLICK_DISTANCE && velocity > SHEET_FLICK_VELOCITY) ? "close" : "snap";
}
