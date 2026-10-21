"use client";
/** "Top 5 vấn đề toàn trường" and "Cảnh báo theo cấp học". */
import { BellRing, ListOrdered, Repeat, Siren, TriangleAlert } from "lucide-react";
import { Badge, Card, EmptyState, ProgressBar, RagBadge } from "@/components/ui";
import { LEVELS, LEVEL_THEME } from "@/lib/constants";
import { fmtNumber } from "@/lib/client/format";
import type { LevelId } from "@/lib/types";
import { share, unitLabel } from "../lib/view-helpers";
import type { LevelSummary, MergedIssue } from "../lib/school-model";
import { RankBubble, RowButton } from "../shared/parts";

export function SchoolIssuesCard({ issues, className }: { issues: MergedIssue[]; className?: string }) {
  const max = issues[0]?.incidents ?? 0;
  return (
    <Card className={className} icon={ListOrdered} title="Top 5 vấn đề toàn trường" subtitle="Gộp theo mã lỗi và nội dung lỗi của các cấp">
      {issues.length === 0 ? (
        <EmptyState size="sm" icon={ListOrdered} title="Chưa có sự việc trong kỳ này" description="Các cấp học chưa ghi nhận sự việc nào trong kỳ đang xem." />
      ) : (
        <ol className="flex flex-col gap-3">
          {issues.map((s, i) => (
            <li key={s.key} className="flex items-start gap-3">
              <RankBubble n={i + 1} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="line-clamp-2 text-[13.5px] font-semibold leading-5 text-brand-900">{s.issue}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge size="sm" tone="muted" className="max-w-[12rem]">
                    {s.category}
                  </Badge>
                  <Badge size="sm" tone={s.unit === "/HS" ? "brand" : "star"}>
                    {unitLabel(s.unit)}
                  </Badge>
                  {s.levels.map((l) => (
                    <Badge
                      key={l.levelId}
                      size="sm"
                      variant="soft"
                      tone="muted"
                      className="gap-1"
                      style={{ backgroundColor: LEVEL_THEME[l.levelId].soft, color: LEVEL_THEME[l.levelId].ink }}
                    >
                      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: LEVEL_THEME[l.levelId].brand }} />
                      {LEVELS[l.levelId].short} {fmtNumber(l.incidents)}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <ProgressBar value={share(s.incidents, max)} tone={i === 0 ? "bad" : "brand"} size="sm" ariaLabel={`${s.incidents} sự việc`} className="flex-1" />
                  <span className="num shrink-0 text-xs text-slate-600">
                    <b className="text-brand-900">{fmtNumber(s.incidents)}</b> sự việc · <b className="text-bad-strong">{fmtNumber(s.points)}</b> điểm
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export interface SchoolAlertsCardProps {
  summaries: LevelSummary[];
  onOpenLevel: (levelId: LevelId, path: string) => void;
  className?: string;
}

export function SchoolAlertsCard({ summaries, onOpenLevel, className }: SchoolAlertsCardProps) {
  const anyAlert = summaries.some((s) => s.rag.RED + s.rag.YELLOW + s.weeklyRedStudents + s.repeatStudents > 0);
  return (
    <Card className={className} icon={BellRing} title="Cảnh báo theo cấp học" subtitle="Lớp mức Đỏ/Vàng và học sinh cần theo dõi trong kỳ của từng cấp">
      {!anyAlert ? (
        <EmptyState size="sm" tone="ok" icon={BellRing} title="Không có cảnh báo" description="Chưa có lớp mức Đỏ/Vàng hoặc học sinh cần theo dõi trong kỳ này." />
      ) : (
        <ul className="-mx-2.5 flex flex-col gap-1">
          {summaries.map((s) => (
            <li key={s.levelId} className="flex flex-col gap-1">
              <RowButton
                onClick={() => onOpenLevel(s.levelId, "/xep-hang")}
                label={`Xem xếp hạng ${s.name}: ${s.rag.RED} lớp mức Đỏ, ${s.rag.YELLOW} lớp mức Vàng`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[13.5px] font-semibold text-brand-900">{s.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge size="sm" tone={s.rag.RED ? "bad" : "muted"} icon={Siren}>
                      {fmtNumber(s.rag.RED)} lớp Đỏ
                    </Badge>
                    <Badge size="sm" tone={s.rag.YELLOW ? "warn" : "muted"} icon={TriangleAlert}>
                      {fmtNumber(s.rag.YELLOW)} lớp Vàng
                    </Badge>
                    <Badge size="sm" tone={s.weeklyRedStudents ? "bad" : "muted"} variant={s.weeklyRedStudents ? "solid" : "soft"} icon={Siren}>
                      {fmtNumber(s.weeklyRedStudents)} HS cảnh báo đỏ
                    </Badge>
                    <Badge size="sm" tone={s.repeatStudents ? "warn" : "muted"} icon={Repeat}>
                      {fmtNumber(s.repeatStudents)} HS tái phạm
                    </Badge>
                  </span>
                  {s.redClasses.length > 0 ? (
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      <RagBadge rag="RED" compact size="sm" />
                      <span className="num">
                        {s.redClasses
                          .slice(0, 6)
                          .map((r) => `${r.classCode} (${fmtNumber(r.avgWeeklyPenalty)}/tuần)`)
                          .join(", ")}
                        {s.redClasses.length > 6 ? ` và ${fmtNumber(s.redClasses.length - 6)} lớp khác` : ""}
                      </span>
                    </span>
                  ) : null}
                </span>
              </RowButton>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
