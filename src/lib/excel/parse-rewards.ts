/**
 * Optional "Điểm thưởng" sheet (written by our own export):
 * Mã thưởng | Ngày | Lớp | Nội dung | Điểm | Người ghi | Minh chứng | Ghi chú | Trạng thái.
 */
import type { Workbook } from "exceljs";
import type { ImportedReward } from "../contract";
import { asIsoDate, asNumber, cellHyperlink } from "./cells";
import { canonicalValue } from "./parse-incidents";
import { clip } from "./normalize";
import type { ClassResolver } from "./roster-rows";
import { findHeader, findSheet, forEachDataRow, type FieldSpec, type Warnings } from "./sheet-reader";

export const REWARD_SHEET_NAMES = ["Điểm thưởng", "Thưởng"] as const;

type RewardKey = "code" | "date" | "classCode" | "reason" | "points" | "reporter" | "evidence" | "note" | "status";

const REWARD_FIELDS: FieldSpec<RewardKey>[] = [
  { key: "code", aliases: ["Mã thưởng", "Mã điểm thưởng"] },
  { key: "date", aliases: ["Ngày", "Ngày ghi nhận"], required: true },
  { key: "classCode", aliases: ["Lớp"], required: true },
  { key: "reason", aliases: ["Nội dung", "Nội dung thưởng", "Lý do", "Lý do thưởng"] },
  { key: "points", aliases: ["Điểm", "Điểm thưởng", "Số điểm"], required: true },
  { key: "reporter", aliases: ["Người ghi", "Người ghi nhận", "Người đề xuất"] },
  { key: "evidence", aliases: ["Minh chứng", "Minh chứng*"] },
  { key: "note", aliases: ["Ghi chú"] },
  { key: "status", aliases: ["Trạng thái"] },
];

const REWARD_STATUSES: Record<string, string> = {
  "moi ghi nhan": "Mới ghi nhận",
  "dang xac minh": "Đang xác minh",
  "da xac nhan": "Đã xác nhận",
};

export function parseRewards(wb: Workbook, ctx: { resolveClass: ClassResolver }, warn: Warnings): ImportedReward[] {
  const ws = findSheet(wb, REWARD_SHEET_NAMES);
  if (!ws) return []; // optional sheet (legacy workbooks have none)
  const header = findHeader(ws, REWARD_FIELDS);
  if (!header) {
    warn.add(ws.name, undefined, "Không tìm thấy dòng tiêu đề (Ngày, Lớp, Điểm) – bỏ qua điểm thưởng.");
    return [];
  }
  const sheet = ws.name;
  const out: ImportedReward[] = [];
  forEachDataRow(ws, header, (row) => {
    if (!row.filled("date") && !row.filled("classCode") && !row.filled("reason")) return;
    const r = row.rowNumber;
    const date = asIsoDate(row.value("date"));
    if (!date) warn.add(sheet, r, row.filled("date") ? `Ngày “${row.text("date")}” không hợp lệ.` : "Thiếu ngày.");
    const classCode = clip(ctx.resolveClass(row.text("classCode")), 20);
    if (!classCode) warn.add(sheet, r, "Thiếu lớp.");
    let points = asNumber(row.value("points"));
    if (points === undefined) {
      warn.add(sheet, r, `Điểm thưởng “${row.text("points")}” không hợp lệ.`);
      points = 0;
    }
    const item: ImportedReward = { rowNumber: r, date, classCode, reason: clip(row.text("reason"), 500), points };
    const code = clip(row.text("code"), 40);
    const reporter = clip(row.text("reporter"), 120);
    const evidence = clip(cellHyperlink(row.cell("evidence")) ?? row.text("evidence"), 1000);
    const note = clip(row.text("note"), 1000);
    const status = clip(canonicalValue(row.text("status"), REWARD_STATUSES), 60);
    if (code) item.code = code;
    if (reporter) item.reporter = reporter;
    if (evidence) item.evidence = evidence;
    if (note) item.note = note;
    if (status) item.status = status;
    out.push(item);
  });
  return out;
}
