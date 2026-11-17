/**
 * Server-side Báo cáo tuần/tháng of a report email / PDF, built exactly like the report screen: the dataset of the level
 * as the VIEWER sees it (GVCN redaction of /api/dataset), the recipients the viewer may address (`recipientOptions`),
 * `buildPeriodReport` and the saved "Công tác phối hợp" of the period. Shared by the print page /in/bao-cao/{nonce},
 * the REPORT job builder and the report mail / PDF routes (one source of truth = the report model + ReportDocument).
 */
import { buildPeriodReport, recipientOptions, type PeriodReport, type RecipientOption } from "@/components/report/lib/report-model";
import { savedPlanContent, type ReportPlanContent } from "@/components/report/lib/report-plan";
import { canAccessLevel, hasPermission } from "../../constants";
import { todayVN } from "../../engine/dates";
import { COL, reportPlanId } from "../../firestore-paths";
import type { LevelDataset, LevelId, ReportPlan, SchoolWeek, UserProfile } from "../../types";
import { buildLevelDataset, redactForGvcn } from "../dataset";
import { db } from "../firebase-admin";
import type { PrintJobSpec } from "./print-jobs";

export const REPORT_DATA_MSG = {
  viewerInactive: "Tài khoản người gửi báo cáo không còn hoạt động.",
  viewerLevel: "Người gửi không còn quyền xem báo cáo của cấp học này.",
  period: "Kỳ báo cáo không có trong lịch tuần của cấp học (Cài đặt → Lịch tuần).",
  recipient: (to: string) => `Người gửi không có quyền lập báo cáo cho người nhận "${to}".`,
} as const;

/** True when the week (Monday) / month (yyyy-mm) is part of the level calendar. */
export function periodInCalendar(period: { mode: "week" | "month"; key: string }, weeks: readonly Pick<SchoolWeek, "weekStart" | "month">[]): boolean {
  return period.mode === "week" ? weeks.some((w) => w.weekStart === period.key) : weeks.some((w) => w.month === period.key);
}

/** The recipient option of `to` the viewer may address (same rules as the report screen); undefined otherwise. */
export function reportRecipientOption(
  profile: Pick<UserProfile, "role" | "gvcnClasses">,
  ds: Pick<LevelDataset, "levelId" | "classes">,
  to: string,
): RecipientOption | undefined {
  return recipientOptions(profile, ds).find((o) => o.key === to);
}

/** Everything ReportDocument needs (serialisable: passed to a client component by the print page). */
export interface LoadedReport {
  report: PeriodReport;
  plan: ReportPlanContent;
  detail: boolean;
  /** config.top90Ratio of the level. */
  topRatio: number;
  /** yyyy-mm-dd of the generation ("Ngày lập"). */
  today: string;
  /** "Người lập báo cáo". */
  preparedBy: string;
}

export type ReportLoad = { ok: true; data: LoadedReport } | { ok: false; reason: string };

/** The dataset of a level as `profile` sees it (GVCN: other classes redacted, exactly like GET /api/dataset). */
export async function datasetForViewer(levelId: LevelId, profile: UserProfile): Promise<LevelDataset> {
  return redactForGvcn(await buildLevelDataset(levelId), profile);
}

/** The saved plan content of a report period (nothing saved → empty). */
export async function loadPlanContent(levelId: LevelId, mode: "week" | "month", key: string): Promise<ReportPlanContent> {
  const snap = await db().collection(COL.reportPlans).doc(reportPlanId(levelId, mode, key)).get();
  return savedPlanContent(snap.exists ? (snap.data() as ReportPlan) : null);
}

/** Fresh profile of the viewer (never the 60 s auth cache: a lock must stop pending report emails). */
async function loadViewer(uid: string): Promise<UserProfile | undefined> {
  if (!uid) return undefined;
  const snap = await db().collection(COL.users).doc(uid).get();
  return snap.exists ? (snap.data() as UserProfile) : undefined;
}

/**
 * Report content of a REPORT job / print job, re-checked against the viewer's CURRENT rights: active account with
 * view.dashboard on the level, period still in the calendar, recipient still allowed. `ok: false` carries the
 * Vietnamese reason (the job is SKIPPED, the print page answers 404).
 */
export async function loadReportForJob(spec: PrintJobSpec, today: string = todayVN()): Promise<ReportLoad> {
  const viewer = await loadViewer(spec.viewerUid);
  if (!viewer?.active) return { ok: false, reason: REPORT_DATA_MSG.viewerInactive };
  if (!hasPermission(viewer, "view.dashboard") || !canAccessLevel(viewer, spec.levelId)) return { ok: false, reason: REPORT_DATA_MSG.viewerLevel };
  const ds = await datasetForViewer(spec.levelId, viewer);
  if (!periodInCalendar(spec, ds.weeks)) return { ok: false, reason: REPORT_DATA_MSG.period };
  const option = reportRecipientOption(viewer, ds, spec.to);
  if (!option) return { ok: false, reason: REPORT_DATA_MSG.recipient(spec.to) };
  const plan = await loadPlanContent(spec.levelId, spec.mode, spec.key);
  const report = buildPeriodReport(ds, { period: { mode: spec.mode, key: spec.key }, recipient: option.recipient, viewer }, today);
  return {
    ok: true,
    data: { report, plan, detail: spec.detail, topRatio: ds.config.top90Ratio, today, preparedBy: spec.preparedBy },
  };
}
