"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { CreditLine } from "@/components/app/shell/credit-line";
import { Logo } from "@/components/app/shell/logo";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { APP_NAME, SCHOOL_NAME } from "@/lib/constants";
import { GuideHero, RoleCards } from "./guide-hero";
import { GuideSearchSummary } from "./guide-search-summary";
import { GuideNavProvider, useGuideNavigation, usePrintExpand, useScrollSpy, useScrolledPast } from "./guide-hooks";
import { GUIDE_WRAP } from "./guide-layout";
import { GUIDE_ANCHORS, GUIDE_GROUP_LABELS, GUIDE_ROLE_LABELS, groupAnchor, groupSections, quickStartAnchor } from "./guide-meta";
import { FILTERED_OUT, FaqList, GlossaryList, GroupHeading, QuickStartCard, SectionCard } from "./guide-sections";
import { GuideToc, GuideTocSheet, type TocNode } from "./guide-toc";
import { GuideTopBar } from "./guide-top-bar";
import { useGuideViewer } from "./guide-viewer";
import { PROSE } from "./guide-blocks";
import { buildGuideIndex, searchGuide } from "./search";
import { InlineText } from "./inline-text";
import type { GuideContent } from "./types";

const FAQ_SUBTITLE = "Hỏi – đáp nhanh";

/**
 * On paper the page is plain block flow (spacing from margins): forced page breaks between flex/grid items are
 * ignored by some engines (WebKit, older Gecko), so "each group starts a new page" relies on block layout.
 */
const PRINT_FLOW = "print:block print:space-y-5";

/** Table of contents: quick starts, one entry per group with its sections, FAQ, glossary. */
export function buildGuideToc(content: GuideContent): TocNode[] {
  const groups = groupSections(content.sections);
  const nodes: TocNode[] = [];
  if (content.quickStarts.length > 0) {
    nodes.push({
      id: GUIDE_ANCHORS.quickStart,
      label: "Bắt đầu nhanh",
      children: content.quickStarts.map((qs) => ({ id: quickStartAnchor(qs.role), label: GUIDE_ROLE_LABELS[qs.role] })),
    });
  }
  for (const g of groups) {
    const children: TocNode[] = g.sections.map((s) => ({ id: s.id, label: s.title }));
    if (g.group === "hoidap" && content.faq.length > 0) children.push({ id: GUIDE_ANCHORS.faq, label: FAQ_SUBTITLE });
    nodes.push({ id: groupAnchor(g.group), label: g.label, children });
  }
  if (content.faq.length > 0 && !groups.some((g) => g.group === "hoidap")) nodes.push({ id: GUIDE_ANCHORS.faq, label: GUIDE_GROUP_LABELS.hoidap });
  if (content.glossary.length > 0) nodes.push({ id: GUIDE_ANCHORS.glossary, label: "Thuật ngữ" });
  return nodes;
}

/** Leaf anchors in document order (scroll spy). */
function leafIds(nodes: readonly TocNode[]): string[] {
  return nodes.flatMap((n) => (n.children && n.children.length > 0 ? n.children.map((c) => c.id) : [n.id]));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** First page of the printout (the hero, search and role cards are screen-only). */
function PrintCover({ content }: { content: GuideContent }) {
  return (
    <div className="mb-8 hidden border-b border-slate-300 pb-6 print:block">
      <Logo size="md" />
      <p className="mt-6 text-[26pt] font-extrabold leading-tight text-brand-900">Hướng dẫn sử dụng {APP_NAME}</p>
      <p className={cn(PROSE, "mt-3")}>
        <InlineText text={content.intro} />
      </p>
      <p className="mt-3 text-[10pt] text-slate-600">
        {SCHOOL_NAME} · Cập nhật {content.updated}
      </p>
    </div>
  );
}

export interface GuideViewProps {
  content: GuideContent;
}

/** The whole /huong-dan page for a given content (no session or dataset required; signed-in readers get shortcuts). */
export function GuideView({ content }: GuideViewProps) {
  const viewer = useGuideViewer();
  const [query, setQuery] = useState("");
  const index = useMemo(() => buildGuideIndex(content), [content]);
  const result = useMemo(() => searchGuide(index, query), [index, query]);
  const searching = result.active;
  const clearSearch = useCallback(() => setQuery(""), []);
  const nav = useGuideNavigation(searching, clearSearch);
  usePrintExpand();

  const groups = useMemo(() => groupSections(content.sections), [content.sections]);
  const toc = useMemo(() => buildGuideToc(content), [content]);
  const spyIds = useMemo(() => leafIds(toc), [toc]);
  const activeId = useScrollSpy(spyIds);
  const scrolled = useScrolledPast();
  const [tocOpen, setTocOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const showResults = useCallback(() => {
    resultsRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);
  const navigateFromSheet = useCallback(
    (id: string) => {
      setTocOpen(false);
      // Let the sheet finish closing (scroll lock, focus return) before scrolling.
      window.setTimeout(() => nav.goTo(id), 320);
    },
    [nav],
  );
  const toTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    document.getElementById("guide-title")?.focus({ preventScroll: true });
  }, []);

  const hasFaqGroup = groups.some((g) => g.group === "hoidap");
  const faqHidden = searching && result.faq.size === 0;
  const faqBlock = (subtitle: boolean) =>
    content.faq.length > 0 ? (
      <div id={GUIDE_ANCHORS.faq} className={cn(faqHidden && FILTERED_OUT)}>
        {subtitle ? <h3 className="mb-3 text-lg font-bold text-brand-900 print:break-after-avoid print:text-[13pt]">{FAQ_SUBTITLE}</h3> : null}
        <FaqList faq={content.faq} sections={content.sections} match={result.faq} searching={searching} />
      </div>
    ) : null;

  return (
    <GuideNavProvider value={nav}>
      <div id={GUIDE_ANCHORS.top} className="min-h-dvh bg-canvas print:bg-white">
        <a
          href="#noi-dung"
          className="sr-only z-[80] rounded-control bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Bỏ qua thanh điều hướng
        </a>
        <GuideTopBar viewer={viewer} onOpenToc={() => setTocOpen(true)} onPrint={() => window.print()} />

        <main id="noi-dung" tabIndex={-1} className="outline-none">
          <GuideHero content={content} query={query} onQueryChange={setQuery} resultCount={searching ? result.total : undefined} onShowResults={showResults} />
          {!searching ? <RoleCards content={content} myRole={viewer.role} /> : null}

          <div className={cn(GUIDE_WRAP, "pb-16 pt-8 sm:pt-10 lg:grid lg:grid-cols-[228px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[252px_minmax(0,1fr)] xl:gap-14 print:block print:p-0")}>
            <aside data-print-hide className="hidden lg:block">
              <nav aria-label="Mục lục" className="no-scrollbar sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-6">
                <p className="mb-2 px-3 text-2xs font-bold uppercase tracking-[0.14em] text-slate-500">Mục lục</p>
                <GuideToc nodes={toc} activeId={activeId} onNavigate={nav.goTo} />
              </nav>
            </aside>

            <div ref={resultsRef} className="flex min-w-0 max-w-[880px] flex-col gap-12 sm:gap-14 print:block print:max-w-none print:space-y-8">
              <PrintCover content={content} />

              {searching ? <GuideSearchSummary result={result} sections={content.sections} onClear={clearSearch} /> : null}

              {content.quickStarts.length > 0 ? (
                <section aria-labelledby={`${GUIDE_ANCHORS.quickStart}-tieu-de`} className={cn("flex flex-col gap-5", PRINT_FLOW, searching && FILTERED_OUT)}>
                  <div id={GUIDE_ANCHORS.quickStart} className="flex items-center gap-3 print:break-after-avoid">
                    <span aria-hidden className="h-7 w-1.5 shrink-0 rounded-full bg-brand-600" />
                    <h2 id={`${GUIDE_ANCHORS.quickStart}-tieu-de`} className="text-[22px] font-bold leading-tight tracking-tight text-brand-900 sm:text-2xl print:text-[17pt]">
                      Bắt đầu nhanh theo vai trò
                    </h2>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2 print:block print:space-y-4">
                    {content.quickStarts.map((qs) => (
                      <QuickStartCard key={qs.role} qs={qs} sections={content.sections} mine={qs.role === viewer.role} />
                    ))}
                  </div>
                </section>
              ) : null}

              {groups.map((g) => {
                const shown = g.sections.filter((s) => !searching || result.sectionIds.has(s.id)).length;
                const isFaq = g.group === "hoidap";
                const hidden = searching && shown === 0 && !(isFaq && result.faq.size > 0);
                return (
                  <section key={g.group} aria-labelledby={`${groupAnchor(g.group)}-tieu-de`} className={cn("flex flex-col gap-5 print:break-before-page", PRINT_FLOW, hidden && FILTERED_OUT)}>
                    <GroupHeading id={groupAnchor(g.group)} headingId={`${groupAnchor(g.group)}-tieu-de`} label={g.label} count={searching ? shown : g.sections.length} />
                    {g.sections.map((s) => (
                      <SectionCard key={s.id} section={s} screenHref={viewer.screenHref(s)} hidden={searching && !result.sectionIds.has(s.id)} />
                    ))}
                    {isFaq ? faqBlock(true) : null}
                  </section>
                );
              })}

              {!hasFaqGroup && content.faq.length > 0 ? (
                <section aria-labelledby={`${groupAnchor("hoidap")}-tieu-de`} className={cn("flex flex-col gap-5 print:break-before-page", PRINT_FLOW, faqHidden && FILTERED_OUT)}>
                  <GroupHeading id={groupAnchor("hoidap")} headingId={`${groupAnchor("hoidap")}-tieu-de`} label={GUIDE_GROUP_LABELS.hoidap} count={content.faq.length} />
                  {faqBlock(false)}
                </section>
              ) : null}

              {content.glossary.length > 0 ? (
                <section
                  aria-labelledby={`${GUIDE_ANCHORS.glossary}-tieu-de`}
                  className={cn("flex flex-col gap-5 print:break-before-page", PRINT_FLOW, searching && result.glossary.size === 0 && FILTERED_OUT)}
                >
                  <GroupHeading id={GUIDE_ANCHORS.glossary} headingId={`${GUIDE_ANCHORS.glossary}-tieu-de`} label="Thuật ngữ" count={content.glossary.length} />
                  <GlossaryList glossary={content.glossary} match={result.glossary} searching={searching} />
                </section>
              ) : null}
            </div>
          </div>
        </main>

        <footer className="border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] print:mt-10 print:border-slate-300 print:bg-white">
          <div className={cn(GUIDE_WRAP, "flex flex-col items-center gap-1.5 pb-20 pt-6 text-center sm:pb-6 print:px-0 print:pb-0")}>
            <p className="text-[13px] text-slate-500 print:text-[9pt]">
              {APP_NAME} · {SCHOOL_NAME} · Cập nhật {content.updated}
            </p>
            <CreditLine printable />
          </div>
        </footer>

        {scrolled ? (
          <div data-print-hide className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-30 animate-fade-in">
            <IconButton icon={ArrowUp} label="Về đầu trang" variant="secondary" onClick={toTop} className="rounded-full shadow-pop" />
          </div>
        ) : null}

        <GuideTocSheet open={tocOpen} onOpenChange={setTocOpen} nodes={toc} activeId={activeId} onNavigate={navigateFromSheet} />
      </div>
    </GuideNavProvider>
  );
}
