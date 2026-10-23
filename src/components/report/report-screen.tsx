"use client";
/**
 * /bao-cao – Báo cáo tuần/tháng (REQ_V2 §6.5). URL: global `mode` (week | month; others → current week) + `key`,
 * `to=bgh | khoi-N | lop-CODE` (limited by role; GVCN → own classes) and `detail=0|1`. Section 5 "Công tác phối hợp
 * tuần/tháng mới" is stored per level + period (GET/PUT /api/report-plans): `report.plan` users edit it above the A4
 * preview, which prints their draft; everyone else sees the saved plan.
 */
import { useCallback, useDeferredValue, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarX2, FileText, School } from "lucide-react";
import { requestLeave } from "@/components/entry/lib/leave-guard";
import { useLeaveGuard } from "@/components/entry/use-leave-guard";
import { Card, EmptyState, PageHeader, toast } from "@/components/ui";
import { useFilters } from "@/lib/client/filters";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import type { LevelDataset } from "@/lib/types";
import { reportFileBase } from "./lib/report-export";
import { buildPeriodReport, parseDetail, recipientOptions, reportPeriod, resolveRecipient, type ReportMode } from "./lib/report-model";
import { ReportDocument } from "./report-document";
import { ReportPlanEditor, ReportPlanLoadError } from "./report-plan-editor";
import { ReportPrintStyles } from "./report-print";
import { ReportToolbar } from "./report-toolbar";
import { useReportExport } from "./use-report-export";
import { useReportPlan } from "./use-report-plan";

export const REPORT_PARAMS = { to: "to", detail: "detail" } as const;

/** Print with `document.title` = file name, so "Lưu PDF" proposes a meaningful name; restored afterwards. */
export function printWithTitle(title: string): void {
  const previous = document.title;
  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  document.title = title;
  window.print();
}

export function ReportScreen({ ds }: { ds: LevelDataset }) {
  const { filters, setFilters, options } = useFilters();
  const { profile, can } = useSession();
  const today = useToday();
  const router = useRouter();
  const pathname = usePathname() ?? "/bao-cao";
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const recipients = useMemo(() => recipientOptions(profile, ds), [profile, ds]);
  const chosen = resolveRecipient(searchParams.get(REPORT_PARAMS.to), recipients);
  const period = useMemo(() => reportPeriod(filters.period, options), [filters.period, options]);
  const detail = chosen ? parseDetail(searchParams.get(REPORT_PARAMS.detail), chosen.recipient) : false;

  const report = useMemo(
    () => (chosen && period ? buildPeriodReport(ds, { period, recipient: chosen.recipient, viewer: profile }, today) : undefined),
    [ds, chosen, period, profile, today],
  );
  const { exporting, exportExcel } = useReportExport(report, today);

  const canPlan = can("report.plan");
  const plan = useReportPlan(ds.levelId, chosen ? period : undefined, canPlan);
  // The preview follows the draft as typed; deferred so typing never waits for the whole A4 document.
  const printedPlan = useDeferredValue(plan.printed);
  // Reload / tab close, in-app links, the level switcher and a period change ask before dropping unsaved plan edits.
  const leaveGuard = useLeaveGuard({
    when: plan.dirty,
    title: "Bỏ công tác phối hợp chưa lưu?",
    message: "Công tác phối hợp của kỳ báo cáo này có thay đổi chưa lưu. Rời trang hoặc đổi kỳ báo cáo sẽ bỏ các thay đổi đó.",
    confirmLabel: "Bỏ thay đổi",
  });

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const p = new URLSearchParams(search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, search],
  );

  // Re-picking the shown mode / period is a no-op (the segmented control fires on the active option too, and a mode
  // without key would jump to the current week): never ask to drop unsaved plan edits for it.
  const onMode = useCallback(
    (mode: ReportMode) => {
      if (mode !== period?.mode) requestLeave(() => setFilters({ period: { mode } }));
    },
    [setFilters, period?.mode],
  );
  const onPeriodKey = useCallback(
    (key: string) => {
      if (key !== period?.key) requestLeave(() => setFilters({ period: { mode: period?.mode === "month" ? "month" : "week", key } }));
    },
    [setFilters, period?.mode, period?.key],
  );

  const header = (
    <PageHeader
      icon={FileText}
      eyebrow={LEVELS[ds.levelId].short}
      title="Báo cáo tuần/tháng"
      description="Báo cáo nền nếp gửi Ban Giám hiệu, tổ khối hoặc GVCN: xem trước khổ A4, in / lưu PDF và xuất Excel chi tiết."
    />
  );

  if (recipients.length === 0 || !chosen) {
    return (
      <div className="flex flex-col gap-5">
        <div data-print-hide>{header}</div>
        <Card padding="none">
          <EmptyState
            icon={School}
            title="Chưa có lớp để lập báo cáo"
            description={
              profile?.role === "GVCN"
                ? "Tài khoản chưa được gán lớp chủ nhiệm trong cấp học này. Vui lòng liên hệ quản trị viên."
                : "Cấp học này chưa có lớp đang hoạt động."
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ReportPrintStyles />
      <div data-print-hide>{header}</div>
      <ReportToolbar
        period={period ?? filters.period}
        periodOptions={options}
        onMode={onMode}
        onPeriodKey={onPeriodKey}
        recipients={recipients}
        recipientKey={chosen.key}
        onRecipient={(key) => setParams({ [REPORT_PARAMS.to]: key })}
        detail={detail}
        onDetail={(on) => setParams({ [REPORT_PARAMS.detail]: on ? "1" : "0" })}
        onPrint={() => {
          if (!report) return;
          printWithTitle(reportFileBase(report));
          if (plan.dirty) toast.warning("Công tác phối hợp chưa được lưu", { description: "Bản in dùng nội dung đang sửa – bấm “Lưu” để giữ lại cho người khác." });
        }}
        onExport={can("excel.export") ? () => void exportExcel() : undefined}
        exporting={exporting}
        rows={report?.detail.length ?? 0}
      />
      {report ? (
        <>
          {canPlan ? <ReportPlanEditor plan={plan} /> : <ReportPlanLoadError plan={plan} />}
          <ReportDocument
            report={report}
            detail={detail}
            topRatio={ds.config.top90Ratio}
            today={today}
            preparedBy={profile?.displayName}
            plan={printedPlan}
          />
        </>
      ) : (
        <Card padding="none">
          <EmptyState icon={CalendarX2} title="Chưa có lịch tuần" description="Cấp học chưa có tuần học trong lịch (Cài đặt → Lịch tuần) nên chưa lập được báo cáo." />
        </Card>
      )}
      {leaveGuard}
    </div>
  );
}
