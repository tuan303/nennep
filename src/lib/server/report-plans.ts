/**
 * "Công tác phối hợp tuần/tháng mới" (Báo cáo tuần/tháng, section 5): the coordination tasks of the NEXT period, written
 * by staff on the report screen. One doc per level + report period: `reportPlans/{level}_{mode}_{key}` (key = the REPORT
 * period: week → its Monday, month → yyyy-mm). A PUT replaces the whole plan in one transaction (doc + audit
 * UPDATE_REPORT_PLAN); `rev` +1 per save, `baseRev` (omitted = 0, i.e. "no plan yet") → 409 when stale. Clearing keeps
 * the doc with `items: []` so the rev chain continues. Plans are not part of LevelDataset: no meta/versions bump.
 */
import type { DocumentReference } from "firebase-admin/firestore";
import type { z } from "zod";
import type { ReportPlanPutSchema, ReportPlanQuerySchema } from "../contract";
import { formatDateVN, isIsoDate, weekdayIndex, weekdayLabelVN } from "../engine/dates";
import { COL, reportPlanId } from "../firestore-paths";
import type { ReportPlan, ReportPlanItem } from "../types";
import { auditDiff, auditOf, writeAudit } from "./audit";
import { actorName, requireLevel, requirePermission, type SessionUser } from "./auth";
import { Errors } from "./errors";
import { db, nowIso } from "./firebase-admin";
import { assertBaseRev, nextRev, omitEmpty, type ServiceCtx } from "./records";
import { runTx } from "./write";

export type ReportPlanQuery = z.output<typeof ReportPlanQuerySchema>;
export type ReportPlanPutData = z.output<typeof ReportPlanPutSchema>;

export const REPORT_PLAN_MSG = {
  invalidWeek: "Tuần báo cáo không hợp lệ (cần ngày Thứ Hai dạng yyyy-mm-dd).",
  notMonday: (key: string) => `Tuần báo cáo phải bắt đầu từ Thứ Hai: ngày ${formatDateVN(key)} là ${weekdayLabelVN(key)}.`,
  invalidMonth: "Tháng không hợp lệ (yyyy-mm).",
  stale: "Công tác phối hợp của kỳ báo cáo này vừa được người khác cập nhật. Vui lòng tải lại để xem bản mới nhất rồi nhập tiếp.",
} as const;

/** Compared to decide whether a save changes anything. */
const CONTENT_FIELDS = ["items", "note"] as const satisfies ReadonlyArray<keyof ReportPlan>;

export function reportPlanRef(id: string): DocumentReference {
  return db().collection(COL.reportPlans).doc(id);
}

/** 400 unless `key` is a real Monday (week) or a real month yyyy-mm (the schema only checks the shape). */
export function assertReportPeriod(mode: ReportPlan["mode"], key: string): void {
  if (mode === "week") {
    if (!isIsoDate(key)) throw Errors.validation(REPORT_PLAN_MSG.invalidWeek, [{ path: "key", message: REPORT_PLAN_MSG.invalidWeek }]);
    if (weekdayIndex(key) !== 0) {
      const message = REPORT_PLAN_MSG.notMonday(key);
      throw Errors.validation(message, [{ path: "key", message }]);
    }
    return;
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) throw Errors.validation(REPORT_PLAN_MSG.invalidMonth, [{ path: "key", message: REPORT_PLAN_MSG.invalidMonth }]);
}

/** Stored item: trimmed by the schema; empty owner/due omitted. */
function canonicalItem(item: ReportPlanItem): ReportPlanItem {
  return omitEmpty<ReportPlanItem>({ content: item.content.trim(), owner: item.owner?.trim(), due: item.due?.trim() }, ["owner", "due"]);
}

/** GET /api/report-plans (view.dashboard + level access): the stored plan, null when nothing was saved for that period. */
export async function getReportPlan(user: SessionUser, q: ReportPlanQuery): Promise<ReportPlan | null> {
  requireLevel(user, q.levelId);
  assertReportPeriod(q.mode, q.key);
  const snap = await reportPlanRef(reportPlanId(q.levelId, q.mode, q.key)).get();
  return snap.exists ? (snap.data() as ReportPlan) : null;
}

/**
 * PUT /api/report-plans (report.plan + level): replaces items + note of the period. An empty list without note is a valid
 * save (clears the section). Saving the same content as the stored plan writes nothing and returns it unchanged.
 */
export async function saveReportPlan(ctx: ServiceCtx, input: ReportPlanPutData): Promise<ReportPlan> {
  const { user } = ctx;
  requirePermission(user, "report.plan");
  requireLevel(user, input.levelId);
  assertReportPeriod(input.mode, input.key);
  const { levelId, mode, key } = input;
  const id = reportPlanId(levelId, mode, key);
  const items = input.items.map(canonicalItem);

  return runTx(async (tx) => {
    // ---------------- reads ----------------
    const snap = await tx.get(reportPlanRef(id));
    const before = snap.exists ? (snap.data() as ReportPlan) : undefined;
    assertBaseRev(before ?? {}, input.baseRev ?? 0, REPORT_PLAN_MSG.stale);

    // ---------------- writes ----------------
    const plan: ReportPlan = omitEmpty<ReportPlan>(
      {
        id,
        levelId,
        mode,
        key,
        items,
        note: input.note?.trim(),
        rev: nextRev(before ?? {}),
        updatedAt: nowIso(),
        updatedBy: user.email,
        updatedByName: actorName(user),
      },
      ["note"],
    );
    if (before && Object.keys(auditDiff(before, plan, CONTENT_FIELDS)).length === 0) return before;
    tx.set(reportPlanRef(id), plan);
    writeAudit(tx, auditOf(user, "UPDATE_REPORT_PLAN", { entity: "reportPlan", entityId: id, levelId, ip: ctx.ip, detail: { mode, key, items: items.length } }));
    return plan;
  });
}
