"use client";
import { useMemo, useState } from "react";
import { CalendarRange, ChevronDown, ListChecks, ShieldCheck } from "lucide-react";
import { Button, Card, EmptyState, cn, toneSoft } from "@/components/ui";
import { canEditIncident, useNow } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import { rosterNames } from "@/components/entry/lib/student-names";
import type { DataIssueCode, Incident, LevelDataset } from "@/lib/types";
import { FixStudentsDialog } from "./fix-students-dialog";
import { Notice } from "./notice";
import { ReviewItem } from "./review-item";
import { filterByIssue, issueGroups, type IssueGroup } from "./lib/review-queue";

const PAGE = 20;

export interface ReviewTabProps {
  ds: LevelDataset;
  /** Review queue (engine-filtered incidents with REVIEW / THIẾU TÊN HS). */
  queue: Incident[];
  onOpen: (incident: Incident) => void;
  onShowWholeYear?: () => void;
}

/** "Cần rà soát": issue groups with explanations, then the records with quick fixes. */
export function ReviewTab({ ds, queue, onOpen, onShowWholeYear }: ReviewTabProps) {
  const { profile } = useSession();
  const now = useNow();
  const [issue, setIssue] = useState<DataIssueCode | "ALL">("ALL");
  const [limit, setLimit] = useState(PAGE);
  const [fixing, setFixing] = useState<Incident | null>(null);

  const groups = useMemo(() => issueGroups(queue), [queue]);
  const roster = useMemo(() => rosterNames(ds.students), [ds.students]);
  const active = groups.some((g) => g.code === issue) ? issue : "ALL";
  const rows = useMemo(() => filterByIssue(queue, active), [queue, active]);
  const reviewCount = useMemo(() => queue.filter((i) => i.dataCheck === "REVIEW").length, [queue]);

  if (queue.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={ShieldCheck}
          tone="ok"
          title="Không có dữ liệu cần rà soát"
          description="Mọi sự việc trong phạm vi lọc đều hợp lệ và đã đủ tên học sinh."
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

  const pick = (code: DataIssueCode | "ALL") => {
    setIssue(code);
    setLimit(PAGE);
  };
  const title = active === "ALL" ? "Tất cả bản ghi cần xử lý" : (groups.find((g) => g.code === active)?.meta.label ?? "");

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="brand" title={`${fmtNumber(reviewCount)} sự việc Cần rà soát · ${fmtNumber(queue.length - reviewCount)} sự việc Thiếu tên HS`}>
        Sự việc <strong>Cần rà soát</strong> làm giảm Độ tin cậy dữ liệu; lớp có độ tin cậy dưới ngưỡng sẽ hiển thị RAG Xám. Sự việc{" "}
        <strong>Thiếu tên HS</strong> vẫn được tính điểm, nên bổ sung tên khi xác định được.
      </Notice>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Lọc theo loại vấn đề">
        <GroupTile label="Tất cả" explanation="Mọi bản ghi Cần rà soát và Thiếu tên HS trong phạm vi lọc." count={queue.length} tone="brand" active={active === "ALL"} onClick={() => pick("ALL")} />
        {groups.map((g) => (
          <GroupTile key={g.code} group={g} active={active === g.code} onClick={() => pick(active === g.code ? "ALL" : g.code)} />
        ))}
      </div>

      <Card padding="none" title={title} subtitle={`${fmtNumber(rows.length)} sự việc · mới nhất trước`} icon={ListChecks}>
        <ul className="divide-y divide-border border-t border-border">
          {rows.slice(0, limit).map((i) => (
            <ReviewItem key={i.id} incident={i} canEdit={canEditIncident(profile, i, now)} onFix={setFixing} onOpen={onOpen} roster={roster} />
          ))}
        </ul>
        {rows.length > limit ? (
          <div className="flex flex-col items-center gap-1 border-t border-border px-4 py-3" data-print-hide>
            <Button variant="ghost" size="sm" iconRight={ChevronDown} onClick={() => setLimit((n) => n + PAGE)}>
              Xem thêm {fmtNumber(Math.min(PAGE, rows.length - limit))} sự việc
            </Button>
            <span className="num text-xs text-slate-500">
              Đang hiển thị {fmtNumber(limit)}/{fmtNumber(rows.length)}
            </span>
          </div>
        ) : null}
      </Card>

      <FixStudentsDialog
        ds={ds}
        incident={fixing}
        onClose={() => setFixing(null)}
        onOpenRecord={(i) => {
          setFixing(null);
          onOpen(i);
        }}
      />
    </div>
  );
}

type GroupTileProps =
  | { group: IssueGroup; active: boolean; onClick: () => void; label?: never; explanation?: never; count?: never; tone?: never }
  | { group?: never; label: string; explanation: string; count: number; tone: "brand"; active: boolean; onClick: () => void };

function GroupTile(props: GroupTileProps) {
  const label = props.group ? props.group.meta.label : props.label;
  const explanation = props.group ? props.group.meta.explanation : props.explanation;
  const count = props.group ? props.group.count : props.count;
  const tone = props.group ? props.group.meta.tone : props.tone;
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        "flex min-h-11 flex-col gap-1.5 rounded-card border bg-surface p-3.5 text-left shadow-card transition-[border-color,box-shadow] duration-150",
        "hover:border-brand-300 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        props.active ? "border-brand-500 ring-2 ring-brand-500/20" : "border-border",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1 ring-inset", toneSoft[tone])}>{label}</span>
        <span className="num text-xl font-bold text-brand-900">{fmtNumber(count)}</span>
      </span>
      <span className="text-[13px] leading-snug text-slate-600">{explanation}</span>
    </button>
  );
}
