/** "Bảo trì" helpers: reset confirmation text, readable rebuild results and evidence-photo statistics. */
import type { EvidenceMaintenanceResult } from "@/lib/contract";
import type { LevelId } from "@/lib/types";

/** Exact text the server requires to reset a level (ResetLevelSchema). */
export function resetConfirmText(levelId: LevelId): string {
  return `XOA ${levelId}`;
}

export interface RebuildCounts {
  weeks: number;
  incidents: number;
  rewards: number;
  students: number;
}

function isCounts(v: unknown): v is RebuildCounts {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return ["weeks", "incidents", "rewards", "students"].every((k) => typeof o[k] === "number");
}

/**
 * Counts of one level from the rebuild response (`{ ok, results: { [level]: RebuildResult } }`).
 * The client type only declares `{ ok }`, so the extra field is read defensively.
 */
export function rebuildCountsOf(response: unknown, levelId: LevelId): RebuildCounts | undefined {
  if (typeof response !== "object" || response === null) return undefined;
  const results = (response as { results?: unknown }).results;
  if (typeof results !== "object" || results === null) return undefined;
  const r = (results as Record<string, unknown>)[levelId];
  return isCounts(r) ? r : undefined;
}

export function rebuildSummaryText(c: RebuildCounts): string {
  const n = (x: number) => x.toLocaleString("vi-VN");
  return `${n(c.weeks)} tuần · ${n(c.incidents)} sự việc · ${n(c.rewards)} điểm thưởng · ${n(c.students)} học sinh`;
}

/** Batch ids are Firestore auto ids (20 chars); accept anything reasonable the user pastes. */
export function normalizeBatchId(raw: string): string {
  return raw.trim().replace(/^RESET:/i, "");
}

/** 512 → "512 B", 204800 → "200 KB", 5_400_000 → "5,1 MB". */
export function storageText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString("vi-VN")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** "120 ảnh (24,5 MB) · 112 đang gắn với bản ghi · 8 ảnh không dùng (1,6 MB)". */
export function evidenceSummaryText(r: EvidenceMaintenanceResult): string {
  const n = (x: number) => x.toLocaleString("vi-VN");
  const orphans = r.orphaned > 0 ? `${n(r.orphaned)} ảnh không dùng (${storageText(r.orphanedBytes)})` : "không có ảnh thừa";
  return `${n(r.total)} ảnh (${storageText(r.totalBytes)}) · ${n(r.attached)} đang gắn với bản ghi · ${orphans}`;
}
