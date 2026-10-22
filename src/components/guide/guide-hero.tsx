"use client";
import { ArrowDown, ArrowRight, BookOpen, CalendarCheck, UsersRound } from "lucide-react";
import { STAR_PATH } from "@/components/app/shell/logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { SearchInput } from "@/components/ui/search-input";
import { useGuideNav } from "./guide-hooks";
import { GUIDE_WRAP } from "./guide-layout";
import { quickStartAnchor, roleEyebrow } from "./guide-meta";
import { ROLE_ICONS } from "./guide-sections";
import { inlineToPlain } from "./inline";
import { InlineText } from "./inline-text";
import type { GuideContent, GuideRole } from "./types";

export interface GuideHeroProps {
  content: GuideContent;
  query: string;
  onQueryChange: (q: string) => void;
  /** Result count of the active search (undefined when not searching). */
  resultCount?: number;
  onShowResults: () => void;
}

/** Navy band: title, intro, last update and the search box (screen only – the printout has its own cover). */
export function GuideHero({ content, query, onQueryChange, resultCount, onShowResults }: GuideHeroProps) {
  const searching = resultCount !== undefined;
  return (
    <section aria-labelledby="guide-title" data-print-hide className="relative overflow-hidden bg-brand-900 text-white">
      <div aria-hidden className="bg-stars absolute inset-0" />
      <svg aria-hidden viewBox="0 0 24 24" className="absolute -right-24 -top-16 size-[420px] rotate-12 text-star-400/[0.07] sm:-right-10">
        <path d={STAR_PATH} fill="currentColor" />
      </svg>
      <div className={cn(GUIDE_WRAP, "relative pb-24 pt-9 sm:pb-28 sm:pt-14")}>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-star-400">Tài liệu hướng dẫn</p>
        <h1 id="guide-title" tabIndex={-1} className="mt-3 max-w-3xl text-[28px] font-extrabold leading-[1.15] tracking-tight text-white outline-none sm:text-[40px]">
          Hướng dẫn sử dụng <span className="text-star-400">NSHM Nền nếp</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/85 sm:text-base">
          <InlineText text={content.intro} tone="onDark" />
        </p>
        <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-white/75">
          <span className="inline-flex items-center gap-1.5">
            <CalendarCheck aria-hidden className="size-4 text-star-400" strokeWidth={2.25} />
            Cập nhật {content.updated}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookOpen aria-hidden className="size-4 text-star-400" strokeWidth={2.25} />
            {content.sections.length} mục hướng dẫn
          </span>
        </p>
        <div
          className="mt-7 max-w-2xl"
          onKeyDownCapture={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") requestAnimationFrame(onShowResults);
          }}
        >
          <SearchInput
            value={query}
            onChange={onQueryChange}
            size="lg"
            delay={200}
            ariaLabel="Tìm trong hướng dẫn"
            placeholder="Tìm trong hướng dẫn…"
            className="[&_input]:shadow-raised"
          />
          <div aria-live="polite" className="mt-2.5 min-h-6 text-[13px] text-white/80">
            {searching ? (
              resultCount > 0 ? (
                <button
                  type="button"
                  onClick={onShowResults}
                  className="inline-flex items-center gap-1.5 rounded-sm font-semibold text-star-300 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-star-400"
                >
                  Có {resultCount} kết quả – xem ngay
                  <ArrowDown aria-hidden className="size-3.5" strokeWidth={2.5} />
                </button>
              ) : (
                <span>Chưa tìm thấy nội dung phù hợp. Hãy thử từ khóa ngắn hơn hoặc tên màn hình, ví dụ “Xếp hạng”.</span>
              )
            ) : (
              <span>Ví dụ: “điểm thưởng”, “xếp hạng”, “đổi mật khẩu” – gõ không dấu cũng được.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Four role cards overlapping the hero: a click jumps to that role's quick-start steps. */
export function RoleCards({ content, myRole }: { content: GuideContent; myRole?: GuideRole }) {
  const nav = useGuideNav();
  if (content.quickStarts.length === 0) return null;
  return (
    <nav aria-label="Bắt đầu nhanh theo vai trò" data-print-hide className={cn(GUIDE_WRAP, "relative -mt-16 sm:-mt-[72px]")}>
      <ul role="list" className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {content.quickStarts.map((qs) => {
          const Icon = ROLE_ICONS[qs.role] ?? UsersRound;
          const mine = qs.role === myRole;
          const anchor = quickStartAnchor(qs.role);
          const eyebrow = roleEyebrow(qs.role, qs.title);
          return (
            <li key={qs.role} className="min-w-0">
              <a
                href={`#${anchor}`}
                onClick={(e) => {
                  if (!nav || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  nav.goTo(anchor);
                }}
                className={cn(
                  "card group flex h-full min-w-0 flex-col p-3.5 shadow-raised transition-[box-shadow,transform,border-color] duration-200 ease-soft sm:p-4",
                  "hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                  mine && "ring-2 ring-star-400",
                )}
              >
                <span className="flex items-start gap-2.5">
                  <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-800 text-white sm:size-10">
                    <Icon className="size-[18px] sm:size-5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 pt-px">
                    {eyebrow ? <span className="block text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-brand-700">{eyebrow}</span> : null}
                    <span className={cn("block text-[14px] font-semibold leading-snug text-brand-900 sm:text-[15px]", !eyebrow && "pt-2 sm:pt-2.5")}>{qs.title}</span>
                  </span>
                </span>
                <span className="mt-2 hidden text-[13px] leading-5 text-slate-600 sm:line-clamp-2">{inlineToPlain(qs.description)}</span>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700">
                    Xem các bước
                    <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                  </span>
                  {mine ? (
                    <Badge tone="star" size="sm">
                      Vai trò của bạn
                    </Badge>
                  ) : null}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
