"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Layers, Printer, SearchX, Star, Trophy } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, buttonClasses } from "@/components/ui";
import { ClassPicker } from "@/components/app/widgets";
import { useFilters } from "@/lib/client/filters";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { LEVELS, levelOfGrade } from "@/lib/constants";
import { periodLabel } from "@/lib/engine";
import type { LevelDataset } from "@/lib/types";
import { ClassDetail } from "./class-detail";
import { ClassOverview } from "./class-overview";
import { gradeFromCode, rankScopeText } from "./lib/class-view";

/**
 * SCR-04 Khối & lớp. The selected class is the global filter `?class=CODE` (FilterBar, the picker below, deep links
 * from Xếp hạng / Tổng quan). Without a class: overview tiles of every class.
 */
export function ClassScreen({ ds }: { ds: LevelDataset }) {
  const { filters, setFilters } = useFilters();
  const today = useToday();
  const { profile } = useSession();
  const searchParams = useSearchParams();
  const rawClass = searchParams.get("class")?.trim() || undefined;
  const cls = filters.classCode ? ds.classes.find((c) => c.code === filters.classCode) : undefined;

  const ownCodes = useMemo(
    () => new Set(profile?.role === "GVCN" ? profile.gvcnClasses.filter((c) => c.levelId === ds.levelId).map((c) => c.classCode) : []),
    [profile, ds.levelId],
  );
  const overviewHref = useMemo(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("class");
    const qs = p.toString();
    return qs ? `/lop?${qs}` : "/lop";
  }, [searchParams]);
  // Same filters on the ranking page: the class stays highlighted there (BR-RANK-06).
  const rankingHref = `/xep-hang?${searchParams.toString()}`;

  const label = periodLabel(filters.period, ds.config.semesters);
  // "thứ hạng trong khối" | "thứ hạng toàn cấp" (THPT ranks the whole level – RankingRule).
  const rankScope = rankScopeText(ds.levelId);
  const pick = (code: string | undefined) => setFilters({ classCode: code });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Layers}
        eyebrow={`${LEVELS[ds.levelId].short} · ${label}`}
        title={cls ? `Lớp ${cls.code}` : "Khối & lớp"}
        breadcrumbs={cls ? [{ label: "Khối & lớp", href: overviewHref }, { label: `Lớp ${cls.code}` }] : undefined}
        description={
          cls
            ? `Khối ${cls.grade} · chỉ số, thứ hạng ${rankScope}, xu hướng điểm thi đua và diễn biến theo ngày.`
            : `Chọn lớp để xem chỉ số, thứ hạng ${rankScope}, xu hướng điểm thi đua và dòng thời gian sự việc.`
        }
        actions={
          <>
            <ClassPicker
              ds={ds}
              allowAll
              allLabel="Tất cả lớp"
              value={filters.classCode}
              grade={filters.grade}
              onChange={pick}
              aria-label="Chọn lớp để xem chi tiết"
              className="w-full sm:w-72"
            />
            {cls ? (
              <>
                <Link href={rankingHref} className={buttonClasses({ variant: "secondary" })}>
                  <Trophy aria-hidden className="size-[18px]" />
                  Bảng xếp hạng
                </Link>
                <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                  In
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {rawClass && !filters.classCode ? (
        <UnknownClassNotice
          ds={ds}
          code={rawClass}
          onGradeReset={() => setFilters({ grade: undefined, classCode: rawClass })}
          onDismiss={() => pick(undefined)}
        />
      ) : null}

      {!cls && ownCodes.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2" data-print-hide>
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-600">
            <Star aria-hidden className="size-4 fill-star-500 text-star-600" />
            Lớp chủ nhiệm:
          </span>
          {[...ownCodes].map((code) => (
            <Button key={code} variant="gold" size="sm" onClick={() => pick(code)}>
              {code}
            </Button>
          ))}
        </div>
      ) : null}

      {cls ? (
        <ClassDetail key={cls.code} ds={ds} cls={cls} filters={filters} today={today} />
      ) : (
        <ClassOverview ds={ds} period={filters.period} grade={filters.grade} today={today} ownCodes={ownCodes} onPick={pick} filters={filters} />
      )}
    </div>
  );
}

/** Deep link with a class that is not in the selected level (or hidden by the grade filter). */
function UnknownClassNotice({
  ds,
  code,
  onGradeReset,
  onDismiss,
}: {
  ds: LevelDataset;
  code: string;
  onGradeReset: () => void;
  onDismiss: () => void;
}) {
  const known = ds.classes.some((c) => c.code === code);
  const grade = gradeFromCode(code);
  const otherLevel = grade !== undefined ? levelOfGrade(grade) : undefined;
  const hint =
    otherLevel && otherLevel !== ds.levelId
      ? `Lớp này có thể thuộc cấp ${LEVELS[otherLevel].name} – hãy chuyển cấp học ở thanh trên cùng.`
      : "Kiểm tra lại mã lớp hoặc chọn lớp khác trong danh sách.";
  return (
    <Card padding="none" data-print-hide>
      <EmptyState
        size="sm"
        icon={SearchX}
        tone="warn"
        title={known ? `Lớp ${code} không thuộc khối đang lọc` : `Không tìm thấy lớp ${code} trong cấp ${LEVELS[ds.levelId].name}`}
        description={known ? "Bỏ lọc khối để xem lớp này." : hint}
        action={
          <>
            {known ? (
              <Button size="sm" onClick={onGradeReset}>
                Bỏ lọc khối
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={onDismiss}>
              Xem tất cả lớp
            </Button>
          </>
        }
      />
    </Card>
  );
}
