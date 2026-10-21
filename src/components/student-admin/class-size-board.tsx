"use client";
import { useMemo, useState } from "react";
import { Check, CircleHelp, Scale, School, TriangleAlert } from "lucide-react";
import { gradeLabel } from "@/components/app/widgets";
import { Badge, Card, EmptyState, Switch, cn, type Tone } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { classSizeGroups, isSizeMismatch, sizeStateText, type ClassSizeRow, type SizeState, type SizeSummary } from "./lib/roster";

const STATE_TONE: Record<SizeState, Tone> = { match: "ok", over: "warn", under: "warn", unknown: "muted" };
const STATE_ICON = { match: Check, over: TriangleAlert, under: TriangleAlert, unknown: CircleHelp } as const;

export interface ClassSizeBoardProps {
  rows: readonly ClassSizeRow[];
  summary: SizeSummary;
  /** Open the roster filtered by this class. */
  onPickClass: (code: string) => void;
}

/** "Sĩ số theo lớp": one card per grade with a tile per class (active students vs sĩ số nguồn). */
export function ClassSizeBoard({ rows, summary, onPickClass }: ClassSizeBoardProps) {
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const shown = useMemo(() => (onlyMismatch ? rows.filter((r) => isSizeMismatch(r) || !r.classActive) : rows), [rows, onlyMismatch]);
  const groups = useMemo(() => classSizeGroups(shown), [shown]);

  return (
    <div className="flex flex-col gap-4">
      <Card padding="sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-5 text-slate-600">
            Sĩ số = số học sinh <strong className="font-semibold text-slate-800">đang học</strong> của lớp, so với sĩ số nguồn trong Cài đặt → Lớp &amp; GVCN.
            {summary.withSource === 0 ? " Hiện chưa lớp nào có sĩ số nguồn." : null}
          </p>
          <Switch
            className="shrink-0"
            checked={onlyMismatch}
            onChange={setOnlyMismatch}
            label="Chỉ lớp lệch sĩ số"
            disabled={summary.mismatches === 0 && summary.inactiveWithStudents === 0}
          />
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={onlyMismatch ? Check : School}
            tone={onlyMismatch ? "ok" : "brand"}
            title={onlyMismatch ? "Không có lớp lệch sĩ số" : "Chưa có lớp đang hoạt động"}
            description={onlyMismatch ? "Sĩ số mọi lớp đều khớp với sĩ số nguồn." : "Thêm lớp trong Cài đặt → Lớp & GVCN."}
          />
        </Card>
      ) : (
        groups.map((g) => (
          <Card
            key={g.grade}
            icon={Scale}
            title={gradeLabel(g.grade)}
            subtitle={`${fmtNumber(g.rows.length)} lớp · ${fmtNumber(g.activeCount)} học sinh đang học`}
            actions={<GroupBadge rows={g.rows} mismatches={g.mismatches} />}
          >
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {g.rows.map((r) => (
                <li key={r.code}>
                  <ClassTile row={r} onPick={() => onPickClass(r.code)} />
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

function GroupBadge({ rows, mismatches }: { rows: readonly ClassSizeRow[]; mismatches: number }) {
  if (mismatches > 0)
    return (
      <Badge tone="warn" icon={TriangleAlert}>
        {mismatches} lớp lệch
      </Badge>
    );
  if (rows.every((r) => r.state === "unknown"))
    return (
      <Badge tone="muted" icon={CircleHelp}>
        Chưa có sĩ số nguồn
      </Badge>
    );
  return (
    <Badge tone="ok" icon={Check}>
      Khớp sĩ số
    </Badge>
  );
}

function ClassTile({ row: r, onPick }: { row: ClassSizeRow; onPick: () => void }) {
  const Icon = STATE_ICON[r.state];
  const state = sizeStateText(r);
  const label = `Lớp ${r.code}: ${r.activeCount} học sinh đang học${r.sourceSize !== undefined ? `, sĩ số nguồn ${r.sourceSize}` : ""}, ${state}${r.classActive ? "" : ", lớp ngừng hoạt động"}. Xem danh sách`;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      className={cn(
        "flex h-full w-full flex-col gap-1.5 rounded-xl border bg-surface p-3 text-left transition-[border-color,box-shadow,transform] duration-150 ease-soft hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        isSizeMismatch(r) || !r.classActive ? "border-warn/40 bg-warn-soft/40 hover:border-warn/60" : "border-border hover:border-brand-200",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="num text-[15px] font-bold text-brand-900">{r.code}</span>
        <Icon aria-hidden className={cn("size-4 shrink-0", r.state === "match" ? "text-ok" : r.state === "unknown" ? "text-slate-400" : "text-warn")} strokeWidth={2.5} />
      </span>
      <span className="num flex items-baseline gap-1">
        <span className="text-2xl font-bold leading-8 tracking-tight text-slate-900">{fmtNumber(r.activeCount)}</span>
        <span className="text-[13px] text-slate-500">{r.sourceSize !== undefined ? `/ ${fmtNumber(r.sourceSize)}` : "HS"}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <Badge tone={STATE_TONE[r.state]} size="sm">
          {state}
        </Badge>
        {!r.classActive ? (
          <Badge tone="bad" size="sm">
            Lớp ngừng hoạt động
          </Badge>
        ) : null}
      </span>
      <span className="truncate text-xs text-slate-500">{r.homeroomTeacher?.trim() || "Chưa có GVCN"}</span>
    </button>
  );
}
