"use client";
import { useMemo, useState } from "react";
import { Check, CircleCheck, Copy, ShieldOff, UserRound, UserX } from "lucide-react";
import { Button, DialogClose, EmptyState, SegmentedControl, Sheet } from "@/components/ui";
import { useToday } from "@/lib/client/hooks";
import { studentHistory, studentStats, type StudentStat } from "@/lib/engine/analytics";
import { ALL_PERIOD, periodLabel } from "@/lib/engine/period";
import type { Incident, LevelDataset, Period, StudentLite } from "@/lib/types";
import { PeriodBadge, StudentAlertBadge } from "./badges";
import { useRetained } from "./hooks";
import { copyWithFallback } from "./manual-copy";
import { buildStudentHistoryText, studentErrorBreakdown, type StudentAlert, type StudentErrorRow } from "./lib/student-summary";
import { ErrorBreakdown, HistoryTimeline, MiniStat, StudentHeader } from "./student-history-parts";

export interface StudentHistorySheetProps {
  ds: LevelDataset;
  /** Student to show; null closes the sheet. */
  studentId: string | null;
  onClose: () => void;
  /** Period of the page filters. When it is not "all", a toggle "Kỳ đang lọc / Cả năm" is shown. */
  period?: Period;
  /** Makes timeline items clickable (e.g. open the IncidentDetailSheet). */
  onOpenIncident?: (incident: Incident) => void;
}

type Scope = "period" | "all";

/**
 * Drawer with a student's discipline history (used by Học sinh, Báo GVCN, Khối & lớp): header, KPIs, alert,
 * per-error breakdown and a timeline. Students outside the viewer's data scope show "Không có quyền xem".
 */
export function StudentHistorySheet({ ds, studentId, onClose, period, onOpenIncident }: StudentHistorySheetProps) {
  const shownId = useRetained(studentId);
  const student = shownId ? ds.students.find((s) => s.id === shownId) : undefined;
  const hasPeriod = !!period && period.mode !== "all" && !!period.key;
  const [scope, setScope] = useState<Scope>("period");
  // Keyed on mode/key so an inline `period={{ … }}` from the parent does not recompute the history every render.
  const pMode = period?.mode;
  const pKey = period?.key;
  const effective = useMemo<Period>(
    () => (hasPeriod && scope === "period" && pMode ? { mode: pMode, key: pKey } : ALL_PERIOD),
    [hasPeriod, scope, pMode, pKey],
  );
  const data = useStudentHistory(ds, student, effective);

  return (
    <Sheet
      open={studentId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setScope("period");
        }
      }}
      title={student ? student.name : "Lịch sử học sinh"}
      description={student ? "Lịch sử nền nếp" : undefined}
      icon={UserRound}
      size="md"
      footer={
        student && data ? (
          <SheetFooter ds={ds} student={student} period={effective} data={data} />
        ) : (
          <DialogClose asChild>
            <Button variant="secondary">Đóng</Button>
          </DialogClose>
        )
      }
    >
      {student && data ? (
        <HistoryBody
          ds={ds}
          student={student}
          period={effective}
          data={data}
          scopeToggle={hasPeriod ? { scope, setScope } : undefined}
          onOpenIncident={onOpenIncident}
        />
      ) : shownId ? (
        <NoAccess redacted={ds.redacted} />
      ) : null}
    </Sheet>
  );
}

function NoAccess({ redacted }: { redacted: boolean }) {
  return redacted ? (
    <EmptyState
      icon={ShieldOff}
      tone="muted"
      title="Không có quyền xem"
      description="Học sinh này không thuộc lớp chủ nhiệm của thầy/cô nên thông tin chi tiết được ẩn."
    />
  ) : (
    <EmptyState
      icon={UserX}
      tone="muted"
      title="Không tìm thấy học sinh"
      description="Học sinh không có trong danh sách của cấp học này. Có thể dữ liệu vừa được cập nhật – thử tải lại trang."
    />
  );
}

interface HistoryData {
  history: Incident[];
  stat?: StudentStat;
  alert: StudentAlert;
  breakdown: StudentErrorRow[];
}

/** Engine history + stats of one student for the period (memoized; undefined without a student). */
function useStudentHistory(ds: LevelDataset, student: StudentLite | undefined, period: Period): HistoryData | undefined {
  const today = useToday();
  const sid = student?.id;
  return useMemo(() => {
    if (!sid) return undefined;
    const history = studentHistory(ds, sid, period);
    const stat = studentStats(ds, { period }, today).find((s) => s.id === sid);
    return { history, stat, alert: stat?.alert ?? "NONE", breakdown: studentErrorBreakdown(history) };
  }, [ds, sid, period, today]);
}

interface HistoryBodyProps {
  ds: LevelDataset;
  student: StudentLite;
  period: Period;
  data: HistoryData;
  scopeToggle?: { scope: Scope; setScope: (s: Scope) => void };
  onOpenIncident?: (incident: Incident) => void;
}

function HistoryBody({ ds, student, period, data, scopeToggle, onOpenIncident }: HistoryBodyProps) {
  const { history, stat, alert, breakdown } = data;
  const gvcn = ds.classes.find((c) => c.code === student.classCode)?.homeroomTeacher;

  return (
    <div className="flex flex-col gap-5">
      <StudentHeader student={student} gvcn={gvcn} />

      <div className="flex flex-col gap-2">
        {scopeToggle ? (
          <SegmentedControl<Scope>
            ariaLabel="Phạm vi thời gian"
            size="sm"
            fullWidth
            value={scopeToggle.scope}
            onChange={scopeToggle.setScope}
            options={[
              { value: "period", label: "Kỳ đang lọc" },
              { value: "all", label: "Cả năm" },
            ]}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <PeriodBadge period={period} semesters={ds.config.semesters} size="sm" />
          <StudentAlertBadge alert={alert} config={ds.config} size="sm" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Lượt vi phạm" value={stat?.incidents ?? 0} tone={(stat?.incidents ?? 0) > 0 ? "bad" : "brand"} />
        <MiniStat label="Điểm liên quan" value={stat?.points ?? 0} hint="Tổng điểm của các lỗi tính theo học sinh (/HS)" />
        <MiniStat label="Loại lỗi" value={stat?.errors.length ?? 0} />
      </div>

      {history.length === 0 ? (
        <EmptyState
          size="sm"
          icon={CircleCheck}
          tone="ok"
          title="Không có vi phạm"
          description={scopeToggle?.scope === "period" ? "Không ghi nhận vi phạm nào trong kỳ này. Chọn “Cả năm” để xem toàn bộ." : "Chưa ghi nhận vi phạm nào trong năm học."}
        />
      ) : (
        <>
          <section className="flex flex-col gap-2.5" aria-labelledby="sh-breakdown">
            <h3 id="sh-breakdown" className="text-sm font-semibold text-brand-900">
              Theo loại lỗi
            </h3>
            <ErrorBreakdown rows={breakdown} />
          </section>
          <section className="flex flex-col gap-2.5" aria-labelledby="sh-timeline">
            <h3 id="sh-timeline" className="text-sm font-semibold text-brand-900">
              Diễn biến ({history.length})
            </h3>
            <HistoryTimeline history={history} student={student} onOpenIncident={onOpenIncident} />
          </section>
        </>
      )}
    </div>
  );
}

function SheetFooter({ ds, student, period, data }: { ds: LevelDataset; student: StudentLite; period: Period; data: HistoryData }) {
  const { history, alert } = data;
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = buildStudentHistoryText({ student, periodText: periodLabel(period, ds.config.semesters), history, alert, config: ds.config });
    if (await copyWithFallback(text, { success: "Đã sao chép lịch sử học sinh.", title: `Sao chép lịch sử – ${student.name}` })) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex w-full items-center justify-end gap-2">
      <DialogClose asChild>
        <Button variant="secondary" className="flex-1 sm:flex-none">
          Đóng
        </Button>
      </DialogClose>
      <Button icon={copied ? Check : Copy} onClick={() => void copy()} className="flex-1 sm:flex-none">
        {copied ? "Đã sao chép" : "Sao chép"}
      </Button>
    </div>
  );
}
