/**
 * Workbook import – "Điểm thưởng" (IO-07): class must exist, valid past date inside the calendar weeks, points > 0,
 * a reason, a valid status (unknown text → WARNING, the stored status is kept; a blank cell keeps it too).
 * Idempotent by doc id `${level}_${code}` like incidents (KT codes generated when empty); like incidents, a code of
 * another class is an ERROR and rewards changed in the app since their last import are not overwritten (WARNING)
 * unless `options.overwriteAppChanges`.
 */
import type { WorkbookPayload } from "../../contract";
import { isIsoDate, mondayOf, weekInfo } from "../../engine/dates";
import { round2 } from "../../engine/scoring";
import { recordDocId } from "../../firestore-paths";
import type { Reward } from "../../types";
import { CALENDAR_MSG, calendarWeekSet } from "../calendar";
import { omitEmpty, omitKeys } from "../records";
import { cleanText, makeClassLookup } from "./common";
import { canonicalJson } from "./hash";
import { isValidCode, type CodeAllocator } from "./workbook-codes";
import { importHashOf, type PlannedRecord } from "./workbook-incidents";
import type { ReferencePlan, WorkbookOptions } from "./workbook-reference";
import type { ImportReport, RowAction } from "./workbook-report";
import { parseRewardStatus, resolveImportedStatus, splitEvidence } from "./workbook-text";

export type RewardDraft = Omit<Reward, "createdAt" | "createdBy" | "createdByName" | "updatedAt" | "updatedBy" | "importBatchId" | "rev" | "importHash">;

export const REWARD_DELETED_SKIP_MESSAGE = "Điểm thưởng này đã bị xóa trong hệ thống – bỏ qua (khôi phục trong mục Dữ liệu nếu cần).";
export const REWARD_APP_CHANGED_SKIP_MESSAGE =
  "Điểm thưởng đã được cập nhật trong phần mềm sau lần nhập trước (xác nhận, chỉnh sửa…) – giữ bản trong phần mềm, không cập nhật theo file. " +
  "Chọn “Ghi đè thay đổi trong phần mềm” nếu muốn cập nhật theo file.";
const OPTIONAL_KEYS = ["reporter", "note", "externalId"] as const satisfies ReadonlyArray<keyof RewardDraft>;

export function rewardContent(r: Reward): RewardDraft {
  const { createdAt: _a, createdBy: _b, createdByName: _c, updatedAt: _d, updatedBy: _e, importBatchId: _f, rev: _g, importHash: _h, ...rest } = r;
  return rest;
}

/** True when the reward still holds exactly what its last import wrote. */
export function rewardUnchangedSinceImport(r: Reward): boolean {
  return !!r.importHash && importHashOf(rewardContent(r)) === r.importHash;
}

export function planRewards(input: {
  payload: WorkbookPayload;
  options: WorkbookOptions;
  ref: ReferencePlan;
  existing: ReadonlyMap<string, Reward>;
  allocator: CodeAllocator;
  today: string;
  report: ImportReport;
}): Array<PlannedRecord<RewardDraft, Reward>> {
  const { payload, ref, report, allocator } = input;
  if (!input.options.rewards) {
    report.skipAll("rewards", payload.rewards.length);
    return [];
  }
  const lookupClass = makeClassLookup(ref.classes);
  const weekSet = calendarWeekSet(ref.weeks);
  const overwrite = input.options.overwriteAppChanges === true;
  const seen = new Map<string, number>();
  const prepared = payload.rewards.map((row) => {
    const errors: string[] = [];
    const code = (row.code ?? "").trim();
    if (code && !isValidCode(code)) errors.push(`Mã điểm thưởng "${code}" không hợp lệ.`);
    if (code && seen.has(code)) errors.push(`Mã điểm thưởng ${code} bị trùng với dòng ${seen.get(code)}.`);
    if (code && !seen.has(code)) seen.set(code, row.rowNumber);
    const date = row.date.trim();
    if (!date) errors.push("Thiếu ngày ghi nhận.");
    else if (!isIsoDate(date)) errors.push(`Ngày "${date}" không hợp lệ.`);
    else if (date > input.today) errors.push(`Ngày ${date} ở tương lai.`);
    else if (!weekSet.has(mondayOf(date))) errors.push(CALENDAR_MSG.outside(date));
    const cls = lookupClass(row.classCode);
    if (!cls) errors.push(row.classCode.trim() ? `Lớp ${row.classCode.trim()} không có trong danh mục lớp.` : "Thiếu lớp.");
    if (!(row.points > 0)) errors.push("Điểm thưởng phải lớn hơn 0.");
    if (!cleanText(row.reason)) errors.push("Thiếu nội dung thưởng.");
    if (errors.length === 0 && code) allocator.noteImported(code);
    return { row, code, date, errors, cls };
  });

  const writes: Array<PlannedRecord<RewardDraft, Reward>> = [];
  for (const p of prepared) {
    if (p.errors.length > 0 || !p.cls) {
      report.row("rewards", { rowNumber: p.row.rowNumber, key: p.code, errors: p.errors, action: "skip" });
      continue;
    }
    const code = p.code || allocator.generate("KT", p.date);
    const id = recordDocId(payload.levelId, code);
    const existing = input.existing.get(id);
    if (existing?.deletedAt) {
      report.row("rewards", { rowNumber: p.row.rowNumber, key: code, warnings: [REWARD_DELETED_SKIP_MESSAGE], action: "skip" });
      continue;
    }
    const warnings: string[] = [];
    if (existing && existing.classCode !== p.cls.code) {
      const message = `Mã ${code} đã thuộc một điểm thưởng khác trong hệ thống (lớp ${existing.classCode}, ngày ${existing.date})`;
      if (!overwrite) {
        report.row("rewards", { rowNumber: p.row.rowNumber, key: code, errors: [`${message} – kiểm tra lại mã trong file; không ghi đè.`], action: "skip" });
        continue;
      }
      warnings.push(`${message} – ghi đè theo file (đã chọn ghi đè).`);
    }
    if (!p.code) warnings.push(`Không có mã – hệ thống cấp mã ${code} (nhập lại file này sẽ tạo bản ghi mới).`);
    const status = resolveImportedStatus(p.row.status, parseRewardStatus, existing?.status, "Mới ghi nhận", "Đã xác nhận");
    const evidence = splitEvidence(p.row.evidence);
    const note = [cleanText(p.row.note), evidence.rest ? `Minh chứng: ${evidence.rest}` : ""].filter(Boolean).join("\n") || undefined;
    const { week, month, semester } = weekInfo(p.date, ref.weeks, ref.config.semesters);
    const fields = {
      date: p.date,
      week,
      month,
      semester,
      classCode: p.cls.code,
      grade: p.cls.grade,
      points: round2(p.row.points),
      reason: cleanText(p.row.reason),
      status: status.status,
      reporter: cleanText(p.row.reporter) || existing?.reporter,
      note: note ?? existing?.note,
      evidenceUrls: evidence.urls.length > 0 ? evidence.urls : existing?.evidenceUrls ?? [],
    };
    const before = existing ? rewardContent(existing) : undefined;
    const draft = omitEmpty<RewardDraft>(
      before
        ? { ...omitKeys(before, ["reporter", "note"]), ...fields, externalId: before.externalId ?? code }
        : { id, code, levelId: payload.levelId, ...fields, photoIds: [], source: "import", externalId: code },
      OPTIONAL_KEYS,
    );
    const action: RowAction = !before ? "create" : canonicalJson(before) === canonicalJson(draft) ? "skip" : "update";
    if (action === "update" && existing && !overwrite && !rewardUnchangedSinceImport(existing)) {
      report.row("rewards", { rowNumber: p.row.rowNumber, key: code, warnings: [REWARD_APP_CHANGED_SKIP_MESSAGE], action: "skip" });
      continue;
    }
    if (action !== "skip") warnings.push(...status.warnings);
    report.row("rewards", { rowNumber: p.row.rowNumber, key: code, warnings, action });
    if (action !== "skip") writes.push({ action, draft, existing });
  }
  return writes;
}
