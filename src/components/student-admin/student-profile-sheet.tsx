"use client";
import { useMemo } from "react";
import { ArrowLeftRight, ArrowUpFromLine, Cake, CalendarCheck, CalendarX, CircleCheck, Hash, History, IdCard, NotebookPen, PencilLine, RotateCcw, School, UserRound } from "lucide-react";
import { StudentAlertBadge, StudentStatusBadge, useRetained } from "@/components/app/widgets";
import { Avatar, Button, DialogClose, EmptyState, ErrorState, Sheet, Skeleton, SkeletonText, cn } from "@/components/ui";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { StudentStat } from "@/lib/engine";
import type { LevelDataset, StudentLite } from "@/lib/types";
import { useStudentRecord } from "./hooks";
import { studentTimeline } from "./lib/timeline";
import { MetaList } from "./parts";
import { RecordTimeline } from "./record-timeline";
import type { RowAction } from "./row-actions-menu";

export interface StudentProfileSheetProps {
  ds: LevelDataset;
  /** null closes the sheet. */
  student: StudentLite | null;
  /** Engine stats of the school year (undefined = no incident). */
  stat?: StudentStat;
  onClose: () => void;
  onAction: (action: RowAction, student: StudentLite) => void;
  /** Show "Chuyển cấp" (another level can be opened). */
  canPromote?: boolean;
}

/** Hồ sơ học sinh: identity, discipline summary of the year and the record timeline (loaded on open). */
export function StudentProfileSheet({ ds, student, stat, onClose, onAction, canPromote }: StudentProfileSheetProps) {
  const shown = useRetained(student);
  const open = student !== null;
  const record = useStudentRecord(open ? shown?.id : null, ds.version);
  const full = record.status === "ready" ? record.student : undefined;
  const timeline = useMemo(() => (full ? studentTimeline(full.history) : []), [full]);
  const cls = shown ? ds.classes.find((c) => c.code === shown.classCode) : undefined;
  const loading = record.status === "loading" || record.status === "idle";

  const act = (a: RowAction) => shown && onAction(a, shown);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={shown?.name ?? "Hồ sơ học sinh"}
      description="Hồ sơ học sinh"
      icon={IdCard}
      size="md"
      footer={
        shown ? (
          <>
            <DialogClose asChild>
              <Button variant="secondary" className="max-sm:hidden">
                Đóng
              </Button>
            </DialogClose>
            {shown.status === "ACTIVE" ? (
              <>
                <Button variant="secondary" icon={ArrowLeftRight} onClick={() => act("transfer")}>
                  Chuyển lớp
                </Button>
                <Button icon={PencilLine} onClick={() => act("edit")}>
                  Sửa thông tin
                </Button>
              </>
            ) : (
              <>
                {canPromote ? (
                  <Button variant="secondary" icon={ArrowUpFromLine} onClick={() => act("promote")}>
                    Chuyển cấp
                  </Button>
                ) : null}
                <Button icon={RotateCcw} onClick={() => act("reinstate")}>
                  Khôi phục
                </Button>
              </>
            )}
          </>
        ) : null
      }
    >
      {shown ? (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Avatar name={shown.name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StudentStatusBadge status={shown.status} size="sm" />
                {stat ? <StudentAlertBadge alert={stat.alert} config={ds.config} size="sm" /> : null}
              </div>
              <p className="num mt-1.5 flex items-center gap-1.5 text-sm text-slate-700">
                <School aria-hidden className="size-4 shrink-0 text-slate-400" strokeWidth={2.25} />
                <span className="min-w-0">
                  Lớp <strong className="font-semibold text-brand-900">{shown.classCode}</strong>
                  {cls?.homeroomTeacher ? ` · GVCN ${cls.homeroomTeacher}` : ""}
                </span>
              </p>
            </div>
          </div>

          <MetaList
            className="grid-cols-2"
            items={[
              { label: "Mã HS", value: shown.id, icon: Hash },
              { label: "Ngày sinh", value: shown.dob ? fmtDate(shown.dob) : "Chưa có", icon: Cake },
              { label: "Giới tính", value: full ? full.gender?.trim() || "Chưa có" : <Skeleton className="mt-1 h-4 w-16" />, icon: UserRound },
              { label: "Ngày nhập học", value: full ? (full.enrolledAt ? fmtDate(full.enrolledAt) : "Chưa có") : <Skeleton className="mt-1 h-4 w-24" />, icon: CalendarCheck },
              shown.status !== "ACTIVE" && full
                ? { label: "Rời trường", value: [full.leftAt ? fmtDate(full.leftAt) : "", full.leftReason].filter(Boolean).join(" · ") || "Chưa có", icon: CalendarX, wide: true }
                : false,
              full?.note?.trim() ? { label: "Ghi chú", value: full.note.trim(), icon: NotebookPen, wide: true } : false,
            ]}
          />

          <section aria-labelledby="sp-discipline" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 id="sp-discipline" className="text-sm font-semibold text-brand-900">
                Nền nếp năm học
              </h3>
              <Button variant="ghost" size="sm" icon={History} onClick={() => act("history")}>
                Xem lịch sử vi phạm
              </Button>
            </div>
            {stat ? (
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Lượt vi phạm" value={stat.incidents} bad />
                <Stat label="Điểm liên quan" value={stat.points} hint="Tổng điểm của các lỗi tính theo học sinh (/HS)" />
                <Stat label="Loại lỗi" value={stat.errors.length} />
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2.5 text-[13px] font-medium text-ok-strong ring-1 ring-inset ring-ok/20">
                <CircleCheck aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
                Chưa ghi nhận vi phạm nào trong năm học.
              </p>
            )}
          </section>

          <section aria-labelledby="sp-timeline" className="flex flex-col gap-3">
            <h3 id="sp-timeline" className="text-sm font-semibold text-brand-900">
              Diễn biến hồ sơ{full ? ` (${timeline.length})` : ""}
            </h3>
            {record.status === "error" ? (
              <ErrorState size="sm" title="Chưa tải được hồ sơ" message={record.error} onRetry={record.reload} />
            ) : loading && !full ? (
              <div role="status" aria-live="polite" className="flex flex-col gap-3">
                <span className="sr-only">Đang tải diễn biến hồ sơ</span>
                {[0, 1].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton round className="size-9 shrink-0" />
                    <div className="flex-1 rounded-xl border border-border p-3">
                      <SkeletonText lines={2} />
                    </div>
                  </div>
                ))}
              </div>
            ) : timeline.length === 0 ? (
              <EmptyState size="sm" tone="muted" title="Chưa có diễn biến" description="Hồ sơ được tạo trước khi hệ thống ghi nhận lịch sử thay đổi." />
            ) : (
              <RecordTimeline items={timeline} />
            )}
          </section>
        </div>
      ) : null}
    </Sheet>
  );
}

function Stat({ label, value, bad, hint }: { label: string; value: number; bad?: boolean; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface px-3 py-2.5" title={hint}>
      <span className="text-xs font-medium leading-4 text-slate-500">{label}</span>
      <span className={cn("num text-[22px] font-bold leading-8 tracking-tight", bad && value > 0 ? "text-bad-strong" : "text-brand-900")}>{fmtNumber(value)}</span>
    </div>
  );
}
