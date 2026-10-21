"use client";
import { useState } from "react";
import { CalendarRange, ChevronDown, CopyCheck, CopyX, Eye, Users } from "lucide-react";
import { ScopeBadge } from "@/components/app/widgets";
import { Badge, Button, Card, EmptyState, StatusBadge, toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/client/format";
import type { DuplicateGroup } from "@/lib/engine";
import { weekdayLabelVN } from "@/lib/engine/dates";
import type { RosterNames } from "@/components/entry/lib/student-names";
import type { Incident, LevelId } from "@/lib/types";
import { PointsText, SourceBadge } from "./incident-columns";
import { reporterOf, subjectsText } from "./lib/incident-rows";
import { DUPLICATE_REASON_LABELS, duplicateDeleteReason, duplicateTotals, notDuplicateRequest } from "./lib/duplicates-view";
import { Notice } from "./notice";

const PAGE = 20;

export interface DuplicatesTabProps {
  levelId: LevelId;
  /** Engine groups of the filtered scope (findPossibleDuplicates). */
  groups: DuplicateGroup[];
  roster?: RosterNames;
  /** Opens a record; `deleteReason` prefills "Xóa" (e.g. "Trùng với NN-…"). */
  onOpen: (incident: Incident, deleteReason?: string) => void;
  onShowWholeYear?: () => void;
}

/**
 * "Có thể trùng": groups of incidents with the same date, class, error and students (or none named) – a penalty that
 * may be counted twice. "Không trùng" marks every pair of a group as reviewed; "Mở" lets an admin delete the extra copy.
 */
export function DuplicatesTab({ levelId, groups, roster, onOpen, onShowWholeYear }: DuplicatesTabProps) {
  const { refresh } = useDataset(levelId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const totals = duplicateTotals(groups);

  async function markNotDuplicate(group: DuplicateGroup) {
    const req = notDuplicateRequest(group);
    if (!req || busyKey) return;
    setBusyKey(group.key);
    try {
      await api.incidents.notDuplicate(req.id, req.input);
      toast.success(`Đã đánh dấu ${fmtNumber(group.incidents.length)} sự việc là không trùng`, {
        description: `Lớp ${group.classCode} · ${fmtDate(group.date)} · ${group.errorCode}`,
      });
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Chưa đánh dấu được. Vui lòng thử lại."));
    } finally {
      setBusyKey(null);
    }
  }

  if (groups.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={CopyCheck}
          tone="ok"
          title="Không phát hiện sự việc có thể trùng"
          description="Không có sự việc nào cùng ngày, cùng lớp, cùng lỗi và cùng học sinh trong phạm vi lọc."
          action={
            onShowWholeYear ? (
              <Button variant="secondary" size="sm" icon={CalendarRange} onClick={onShowWholeYear}>
                Kiểm tra cả năm học
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warn" icon={CopyX} title={`${fmtNumber(totals.groups)} nhóm · ${fmtNumber(totals.records)} sự việc · có thể tính trùng −${fmtNumber(totals.extraPoints)} điểm`}>
        Sự việc cùng ngày, cùng lớp, cùng lỗi và cùng học sinh (hoặc đều không ghi tên học sinh) có thể là một sự việc được ghi
        hai lần. Nếu là các sự việc khác nhau, chọn <strong>Không trùng</strong>; nếu ghi trùng, mở bản ghi thừa để quản trị xóa
        kèm lý do.
      </Notice>
      <ul className="flex flex-col gap-3">
        {groups.slice(0, limit).map((g) => (
          <li key={g.key}>
            <DuplicateGroupCard group={g} roster={roster} busy={busyKey === g.key} disabled={busyKey !== null} onNotDuplicate={() => void markNotDuplicate(g)} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {groups.length > limit ? (
        <div className="flex justify-center" data-print-hide>
          <Button variant="ghost" size="sm" iconRight={ChevronDown} onClick={() => setLimit((n) => n + PAGE)}>
            Xem thêm {fmtNumber(Math.min(PAGE, groups.length - limit))} nhóm
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  roster?: RosterNames;
  busy: boolean;
  disabled?: boolean;
  onNotDuplicate: () => void;
  onOpen: (incident: Incident, deleteReason?: string) => void;
}

export function DuplicateGroupCard({ group: g, roster, busy, disabled, onNotDuplicate, onOpen }: DuplicateGroupCardProps) {
  return (
    <Card padding="none">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600">
            <span className="num font-semibold text-brand-900">
              {weekdayLabelVN(g.date)}, {fmtDate(g.date)}
            </span>
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-bold text-brand-800">Lớp {g.classCode}</span>
            <Badge tone="muted" size="sm" icon={Users}>
              {DUPLICATE_REASON_LABELS[g.reason]}
            </Badge>
          </p>
          <p className="text-[15px] font-medium text-slate-800">
            <span className="num mr-1.5 font-bold text-slate-500">{g.errorCode}</span>
            {g.issue}
          </p>
          <Badge tone="bad" size="md" className="num self-start">
            Có thể tính trùng −{fmtNumber(g.extraPoints)} điểm
          </Badge>
        </div>
        <Button variant="outline" size="sm" icon={CopyCheck} loading={busy} disabled={disabled && !busy} onClick={onNotDuplicate} className="shrink-0 self-start">
          Không trùng
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {g.incidents.map((i, idx) => (
          <li key={i.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span className="num font-semibold text-brand-900">{i.code}</span>
                {idx === 0 ? (
                  <Badge tone="ok" size="sm">
                    Ghi sớm nhất
                  </Badge>
                ) : null}
                <span className="num text-slate-500">Ghi lúc {fmtDateTime(i.createdAt)}</span>
              </p>
              <p className="truncate text-[13px] text-slate-700">
                {subjectsText(i, roster)} · Người ghi: {reporterOf(i)}
              </p>
              <p className="flex flex-wrap items-center gap-1.5">
                <ScopeBadge scope={i.scope} size="sm" />
                <StatusBadge status={i.status} size="sm" />
                <SourceBadge source={i.source} />
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <PointsText points={i.points} className="text-base" />
              <Button size="sm" variant="ghost" icon={Eye} onClick={() => onOpen(i, duplicateDeleteReason(i, g))} aria-label={`Mở sự việc ${i.code}`}>
                Mở
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
