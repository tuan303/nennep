"use client";
import { useMemo } from "react";
import { ShieldOff, Smile, UserRoundSearch } from "lucide-react";
import { Avatar, Card, DataTable, EmptyState, type DataTableColumn } from "@/components/ui";
import { StudentAlertBadge, StudentStatusBadge } from "@/components/app/widgets";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { StudentStat } from "@/lib/engine";
import type { LevelConfig } from "@/lib/types";

export interface ClassStudentsProps {
  classCode: string;
  students: StudentStat[];
  config: LevelConfig;
  /** GVCN viewing another class: names are not available. */
  hidden: boolean;
  /** Σ related students of the class in the period (shown when names are hidden). */
  relatedStudents: number;
  onOpenStudent: (studentId: string) => void;
  className?: string;
}

function topErrors(s: StudentStat, n = 2): string {
  const head = s.errors.slice(0, n).map((e) => `${e.errorCode} ×${e.count}`);
  return s.errors.length > n ? `${head.join(", ")}, +${s.errors.length - n}` : head.join(", ");
}

/** "Học sinh có vi phạm trong lớp": engine studentStats of the class in the period; row → history sheet. */
export function ClassStudents({ classCode, students, config, hidden, relatedStudents, onOpenStudent, className }: ClassStudentsProps) {
  const columns = useMemo<DataTableColumn<StudentStat>[]>(
    () => [
      {
        key: "name",
        header: "Học sinh",
        sortValue: (s) => s.name,
        cell: (s) => <StudentName s={s} classCode={classCode} />,
      },
      {
        key: "incidents",
        header: "Lượt",
        align: "right",
        width: 64,
        sortValue: (s) => s.incidents,
        cell: (s) => <strong className="font-semibold text-brand-900">{fmtNumber(s.incidents)}</strong>,
      },
      {
        key: "points",
        header: "Điểm",
        headerLabel: "Điểm cá nhân",
        align: "right",
        width: 64,
        sortValue: (s) => s.points,
        cell: (s) => (
          <span className={s.points > 0 ? "font-semibold text-bad-strong" : "text-slate-400"}>{s.points > 0 ? `−${fmtNumber(s.points)}` : "0"}</span>
        ),
      },
      {
        key: "alert",
        header: "Cảnh báo",
        sortValue: (s) => (s.alert === "WEEKLY_RED" ? 2 : s.alert === "REPEAT" ? 1 : 0),
        cell: (s) =>
          s.alert === "NONE" ? <span className="text-xs text-slate-400">–</span> : <StudentAlertBadge alert={s.alert} config={config} size="sm" />,
      },
    ],
    [classCode, config],
  );

  return (
    <Card
      padding="none"
      className={className}
      icon={UserRoundSearch}
      title="Học sinh có vi phạm trong lớp"
      subtitle={hidden ? "Thông tin học sinh được ẩn" : `${fmtNumber(students.length)} học sinh · bấm để xem lịch sử`}
    >
      {hidden ? (
        <EmptyState
          size="sm"
          icon={ShieldOff}
          tone="muted"
          title="Danh sách học sinh được ẩn"
          description={`Lớp này không thuộc lớp chủ nhiệm của thầy/cô nên chỉ hiển thị số liệu tổng hợp: ${fmtNumber(relatedStudents)} lượt học sinh liên quan trong kỳ.`}
        />
      ) : (
        <div className="border-t border-border">
          <DataTable
            caption={`Học sinh có vi phạm của lớp ${classCode}`}
            columns={columns}
            rows={students}
            rowKey={(s) => s.id}
            onRowClick={(s) => onOpenStudent(s.id)}
            rowLabel={(s) => `Xem lịch sử của ${s.name}`}
            pageSize={8}
            dense
            emptyState={
              <EmptyState
                size="sm"
                icon={Smile}
                tone="ok"
                title="Chưa có học sinh vi phạm trong kỳ này"
                description="Không học sinh nào của lớp được nêu tên trong sự việc của kỳ đang chọn."
              />
            }
            mobileCard={(s) => (
              <div className="flex items-center gap-3">
                <Avatar name={s.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <StudentName s={s} classCode={classCode} compact />
                </div>
                <div className="num flex shrink-0 flex-col items-end gap-1 text-right">
                  <span className="text-sm font-bold text-brand-900">{fmtNumber(s.incidents)} lượt</span>
                  {s.alert !== "NONE" ? (
                    <StudentAlertBadge alert={s.alert} size="sm" />
                  ) : s.points > 0 ? (
                    <span className="text-xs text-bad-strong">−{fmtNumber(s.points)} điểm</span>
                  ) : null}
                </div>
              </div>
            )}
          />
        </div>
      )}
    </Card>
  );
}

function StudentName({ s, classCode, compact }: { s: StudentStat; classCode: string; compact?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold text-brand-900">{s.name}</span>
        {s.status !== "ACTIVE" ? <StudentStatusBadge status={s.status} size="sm" /> : null}
      </span>
      <span className="num truncate text-xs text-slate-500">
        {s.id}
        {s.classCode !== classCode ? ` · hiện ở lớp ${s.classCode}` : ""}
        {s.errors.length ? ` · ${topErrors(s)}` : ""}
        {!compact && s.lastDate ? ` · gần nhất ${fmtDate(s.lastDate)}` : ""}
      </span>
    </span>
  );
}
