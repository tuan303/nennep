"use client";
import { useMemo, type ReactNode } from "react";
import { StudentStatusBadge } from "@/components/app/widgets";
import { Avatar, DataTable, cn, type DataTableColumn } from "@/components/ui";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { ClassInfo, StudentLite } from "@/lib/types";
import { classRankMap, nameSortKey } from "./lib/roster";
import { RowActionsMenu, type RowAction } from "./row-actions-menu";

const WIDE_ONLY = "max-xl:hidden";

export interface RosterTableProps {
  rows: readonly StudentLite[];
  classes: readonly ClassInfo[];
  /** Student id → incidents of the school year. */
  violations: ReadonlyMap<string, number>;
  onAction: (action: RowAction, student: StudentLite) => void;
  /** Show "Chuyển cấp" (the user can open another level). */
  canPromote?: boolean;
  emptyState: ReactNode;
}

/** Roster table (cards below 640px). No row click: the name opens the profile, "⋯" holds the actions. */
export function RosterTable({ rows, classes, violations, onAction, canPromote, emptyState }: RosterTableProps) {
  const rank = useMemo(() => classRankMap(classes), [classes]);
  const teacher = useMemo(() => new Map(classes.map((c) => [c.code, c.homeroomTeacher] as const)), [classes]);

  const columns = useMemo<DataTableColumn<StudentLite>[]>(
    () => [
      {
        key: "id",
        header: "Mã HS",
        width: 120,
        // Below 1280px the id and birthday move under the name (no horizontal scroll on tablets).
        className: WIDE_ONLY,
        headerClassName: WIDE_ONLY,
        sortValue: (s) => s.id,
        cell: (s) => <span className="num font-medium text-slate-600">{s.id}</span>,
      },
      {
        key: "name",
        header: "Họ và tên",
        sortValue: (s) => nameSortKey(s.name),
        cell: (s) => <NameButton student={s} onOpen={() => onAction("profile", s)} />,
      },
      {
        key: "dob",
        header: "Ngày sinh",
        width: 120,
        className: WIDE_ONLY,
        headerClassName: WIDE_ONLY,
        sortValue: (s) => s.dob ?? "",
        cell: (s) => (s.dob ? <span className="num">{fmtDate(s.dob)}</span> : <span className="text-slate-400">–</span>),
      },
      {
        key: "class",
        header: "Lớp",
        width: 140,
        // Text key so the first click sorts A→Z (class display order).
        sortValue: (s) => String(rank.get(s.classCode) ?? 9000 + s.grade).padStart(5, "0"),
        cell: (s) => (
          <div className="min-w-0">
            <p className="num font-semibold text-brand-900">{s.classCode}</p>
            {teacher.get(s.classCode) ? <p className="max-w-[160px] truncate text-xs text-slate-500">{teacher.get(s.classCode)}</p> : null}
          </div>
        ),
      },
      {
        key: "status",
        header: "Trạng thái",
        width: 150,
        sortValue: (s) => (s.status === "ACTIVE" ? "0" : `1${s.status}`),
        cell: (s) => <StudentStatusBadge status={s.status} size="sm" />,
      },
      {
        key: "violations",
        header: "Lượt vi phạm",
        headerLabel: "Số lượt vi phạm",
        align: "right",
        width: 120,
        sortValue: (s) => violations.get(s.id) ?? 0,
        cell: (s) => <ViolationCount count={violations.get(s.id) ?? 0} onOpen={() => onAction("history", s)} name={s.name} />,
      },
      {
        key: "actions",
        header: <span className="sr-only">Thao tác</span>,
        headerLabel: "Thao tác",
        align: "right",
        width: 64,
        cell: (s) => <RowActionsMenu student={s} onAction={onAction} canPromote={canPromote} />,
      },
    ],
    [rank, teacher, violations, onAction, canPromote],
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(s) => s.id}
      pageSize={50}
      caption="Danh sách học sinh"
      emptyState={emptyState}
      rowClassName={(s) => (s.status !== "ACTIVE" ? "bg-surface-2/60" : undefined)}
      mobileCard={(s) => <MobileRow student={s} count={violations.get(s.id) ?? 0} onAction={onAction} canPromote={canPromote} />}
    />
  );
}

function NameButton({ student, onOpen }: { student: StudentLite; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group -mx-1 -my-1 flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 text-left focus-visible:outline-2 focus-visible:outline-brand-500 pointer-fine:min-h-0"
      aria-label={`Xem hồ sơ ${student.name}`}
    >
      <Avatar name={student.name} size="sm" />
      <span className="min-w-0">
        <span className={cn("block truncate font-semibold text-slate-900 group-hover:text-brand-700 group-hover:underline", student.status !== "ACTIVE" && "text-slate-600")}>
          {student.name}
        </span>
        <span className="num block truncate text-xs text-slate-500 xl:hidden">
          {student.id}
          {student.dob ? ` · ${fmtDate(student.dob)}` : ""}
        </span>
      </span>
    </button>
  );
}

function ViolationCount({ count, onOpen, name }: { count: number; onOpen: () => void; name: string }) {
  if (count === 0) return <span className="text-slate-400">–</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${name}: ${count} lượt vi phạm – xem lịch sử`}
      className="num inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-bad-soft px-2.5 text-[13px] font-bold text-bad-strong ring-1 ring-inset ring-bad/20 transition-colors hover:bg-bad/15 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:h-10 pointer-coarse:min-w-10"
    >
      {fmtNumber(count)}
    </button>
  );
}

function MobileRow({
  student: s,
  count,
  onAction,
  canPromote,
}: {
  student: StudentLite;
  count: number;
  onAction: (action: RowAction, student: StudentLite) => void;
  canPromote?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onAction("profile", s)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-brand-500" aria-label={`Xem hồ sơ ${s.name}`}>
        <Avatar name={s.name} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-brand-900">{s.name}</span>
          <span className="num mt-0.5 block truncate text-[13px] text-slate-600">
            Lớp <strong className="font-semibold text-slate-800">{s.classCode}</strong> · Mã {s.id}
          </span>
          <span className="num mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {s.status !== "ACTIVE" ? <StudentStatusBadge status={s.status} size="sm" /> : null}
            {s.dob ? <span>SN {fmtDate(s.dob)}</span> : null}
            {count > 0 ? <span className="font-semibold text-bad-strong">{fmtNumber(count)} lượt vi phạm</span> : null}
          </span>
        </span>
      </button>
      <RowActionsMenu student={s} onAction={onAction} canPromote={canPromote} className="shrink-0" />
    </div>
  );
}
