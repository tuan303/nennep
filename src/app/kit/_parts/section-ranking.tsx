"use client";

import { useState } from "react";
import { Medal, Printer, Trophy } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  cn,
  DataTable,
  formatNumberVN,
  RagBadge,
  Section,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  Top90Badge,
  type DataTableColumn,
} from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { RANKING, WEEKS, type DemoRankingRow } from "./demo-data";

const HIGHLIGHT = "6A03";

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        "num inline-flex size-8 items-center justify-center rounded-full text-[13px] font-bold",
        rank === 1 && "bg-star-500 text-brand-950 shadow-gold",
        rank === 2 && "bg-star-100 text-star-800 ring-1 ring-inset ring-star-400/50",
        rank === 3 && "bg-star-50 text-star-800 ring-1 ring-inset ring-star-300/60",
        rank > 3 && "bg-muted-soft text-muted-strong",
      )}
      aria-label={`Hạng ${rank}`}
    >
      {rank}
    </span>
  );
}

const signed = (n: number, sign: "+" | "−") => (n === 0 ? "0" : `${sign}${formatNumberVN(n)}`);

const COLUMNS: DataTableColumn<DemoRankingRow>[] = [
  { key: "rank", header: "Hạng", width: 64, sortValue: (r) => r.rank, cell: (r) => <RankBadge rank={r.rank} /> },
  {
    key: "class",
    header: "Lớp",
    sortValue: (r) => r.classCode,
    cell: (r) => (
      <span className="font-semibold text-brand-900">
        {r.classCode}
        {r.classCode === HIGHLIGHT ? <span className="ml-2 rounded bg-star-100 px-1.5 py-0.5 text-2xs font-bold text-star-800">Đang lọc</span> : null}
      </span>
    ),
  },
  {
    key: "teacher",
    header: "GVCN",
    hideOnMobile: true,
    sortValue: (r) => r.teacher.split(" ").pop() ?? r.teacher,
    cell: (r) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={r.teacher} size="sm" />
        <span className="truncate text-slate-700">{r.teacher}</span>
      </span>
    ),
  },
  { key: "base", header: "Điểm nền", align: "right", hideOnMobile: true, sortValue: (r) => r.base, cell: (r) => formatNumberVN(r.base) },
  { key: "reward", header: "Thưởng", align: "right", sortValue: (r) => r.reward, cell: (r) => <span className="text-ok-strong">{signed(r.reward, "+")}</span> },
  { key: "penalty", header: "Trừ", align: "right", sortValue: (r) => r.penalty, cell: (r) => <span className="text-bad-strong">{signed(r.penalty, "−")}</span> },
  {
    key: "score",
    header: "Thi đua",
    align: "right",
    sortValue: (r) => r.score,
    cell: (r) => <span className="text-[15px] font-bold text-brand-900">{formatNumberVN(r.score)}</span>,
  },
  { key: "top90", header: "Top 90%", sortValue: (r) => (r.inTop90 ? 1 : 0), cell: (r) => <Top90Badge inTop90={r.inTop90} size="sm" /> },
  { key: "rag", header: "RAG", cell: (r) => <RagBadge rag={r.rag} reason={r.ragReason} compact size="sm" /> },
  {
    key: "trend",
    header: "Xu hướng",
    hideOnMobile: true,
    cell: (r) => <Sparkline data={r.trend} width={88} height={28} ariaLabel={`Điểm thi đua ${WEEKS.length} tuần của lớp ${r.classCode}`} />,
  },
];

function MobileRow({ r }: { r: DemoRankingRow }) {
  return (
    <div className="flex items-center gap-3">
      <RankBadge rank={r.rank} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold text-brand-900">
          {r.classCode}
          {r.classCode === HIGHLIGHT ? <span className="rounded bg-star-100 px-1.5 py-0.5 text-2xs font-bold text-star-800">Đang lọc</span> : null}
        </p>
        <p className="truncate text-[13px] text-slate-500">GVCN {r.teacher}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Top90Badge inTop90={r.inTop90} size="sm" />
          <RagBadge rag={r.rag} reason={r.ragReason} compact size="sm" />
        </div>
      </div>
      <div className="num text-right">
        <p className="text-lg font-bold leading-6 text-brand-900">{formatNumberVN(r.score)}</p>
        <p className="text-xs">
          <span className="text-ok-strong">{signed(r.reward, "+")}</span> · <span className="text-bad-strong">{signed(r.penalty, "−")}</span>
        </p>
      </div>
    </div>
  );
}

/** Ranking table per grade with RAG/Top 90 badges, highlight row, sorting, mobile cards and "Xem thêm". */
export function SectionRanking() {
  const [grade, setGrade] = useState("6");
  return (
    <Section
      id="xep-hang"
      icon={Trophy}
      title="Xếp hạng thi đua"
      description="Điểm thi đua = điểm nền + thưởng − trừ. Top 90% theo từng khối; bộ lọc lớp chỉ làm nổi bật, không đổi thứ hạng."
      actions={
        <Button variant="secondary" size="sm" icon={Printer} onClick={() => toast("Đang chuẩn bị bản in")}>
          In bảng
        </Button>
      }
      className="scroll-mt-6"
    >
      <Card padding="none">
        <Tabs value={grade} onValueChange={setGrade} className="gap-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <TabsList variant="pill" aria-label="Chọn khối">
              {[6, 7, 8, 9].map((g) => (
                <TabsTrigger key={g} value={String(g)} count={RANKING[g].length}>
                  Khối {g}
                </TabsTrigger>
              ))}
            </TabsList>
            <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
              <Medal aria-hidden className="size-4 text-star-600" />9 tuần tính điểm · ngưỡng Top 90%: hạng {Math.ceil(0.9 * RANKING[Number(grade)].length)}
            </p>
          </div>
          {[6, 7, 8, 9].map((g) => (
            <TabsContent key={g} value={String(g)}>
              <DataTable
                caption={`Bảng xếp hạng thi đua khối ${g}`}
                columns={COLUMNS}
                rows={RANKING[g]}
                rowKey={(r) => r.classCode}
                initialSort={{ key: "rank", dir: "asc" }}
                onRowClick={(r) => toast(`Mở chi tiết lớp ${r.classCode}`)}
                rowLabel={(r) => `Xem chi tiết lớp ${r.classCode}, hạng ${r.rank}`}
                rowClassName={(r) => (r.classCode === HIGHLIGHT ? "bg-star-50/70 [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-star-500)]" : undefined)}
                mobileCard={(r) => <MobileRow r={r} />}
                pageSize={8}
              />
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </Section>
  );
}
