"use client";
import { SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { useGuideNav } from "./guide-hooks";
import { guideIcon } from "./guide-icons";
import type { GuideSearchResult } from "./search";
import type { GuideSection } from "./types";

const MAX_LINKS = 6;

/** Above the filtered guide: result count, the best matching sections as shortcuts, "Xóa tìm kiếm". */
export function GuideSearchSummary({ result, sections, onClear }: { result: GuideSearchResult; sections: readonly GuideSection[]; onClear: () => void }) {
  const nav = useGuideNav();
  const q = result.query.trim();
  const byId = new Map(sections.map((s) => [s.id, s] as const));
  const best = result.ranked.slice(0, MAX_LINKS).flatMap((id) => {
    const s = byId.get(id);
    return s ? [s] : [];
  });
  return (
    <div data-print-hide className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-[15px] text-slate-700">
            {result.total > 0 ? "Có " : "Không có kết quả cho "}
            {result.total > 0 ? <strong className="num font-semibold text-brand-900">{result.total}</strong> : null}
            {result.total > 0 ? " kết quả cho " : null}“<strong className="font-semibold text-brand-900">{q}</strong>”.
          </p>
          <Button variant="secondary" size="sm" icon={X} onClick={onClear}>
            Xóa tìm kiếm
          </Button>
        </div>
        {best.length > 0 ? (
          <div className="border-t border-border pt-3">
            <p className="text-[13px] font-semibold text-slate-600">Mục phù hợp nhất</p>
            <ul role="list" className="mt-2 flex flex-wrap gap-2">
              {best.map((s) => {
                const Icon = guideIcon(s.icon);
                return (
                  <li key={s.id} className="min-w-0 max-w-full">
                    <a
                      href={`#${encodeURIComponent(s.id)}`}
                      onClick={(e) => {
                        if (!nav || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        nav.goTo(s.id);
                      }}
                      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[13px] font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 pointer-coarse:min-h-10"
                    >
                      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
                      <span className="truncate">{s.title}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
      {result.total === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Chưa tìm thấy nội dung phù hợp"
          description="Hãy thử từ khóa khác, tên màn hình (ví dụ “Nhập liệu”) hoặc xem Mục lục."
          className="card"
        />
      ) : null}
    </div>
  );
}
