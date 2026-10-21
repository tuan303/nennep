/** Clamp a typed/stepped number into [min, max]; integers when step ≥ 1, otherwise snapped to `step`. */
export function clampStep(n: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(n)) return min;
  const snapped = step >= 1 ? Math.round(n) : Math.round(n / step) * step;
  return Math.min(max, Math.max(min, snapped));
}
