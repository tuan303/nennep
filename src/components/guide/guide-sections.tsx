"use client";
import Link from "next/link";
import { ArrowRight, ChevronDown, CircleQuestionMark, Link2, ShieldCheck, ClipboardPen, Eye, GraduationCap, UsersRound, type LucideIcon } from "lucide-react";
import { routeForPath } from "@/components/app/shell/routes";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { GuideBlockView, PROSE, StepList } from "./guide-blocks";
import { useGuideNav } from "./guide-hooks";
import { guideIcon } from "./guide-icons";
import { quickStartAnchor, roleEyebrow, rolesText } from "./guide-meta";
import { InlineText } from "./inline-text";
import type { GuideContent, GuideFaq, GuideQuickStart, GuideRole, GuideSection } from "./types";

/** Hidden on screen while a search filters it out, but always on paper (the printout is the full guide). */
export const FILTERED_OUT = "hidden print:block";

/** Highlight after an in-page jump (`data-highlight` is set by useGuideNavigation). */
const HIGHLIGHTABLE =
  "transition-[box-shadow,background-color] duration-500 data-[highlight]:bg-brand-50/40 data-[highlight]:shadow-raised data-[highlight]:ring-2 data-[highlight]:ring-brand-500/50";

export const ROLE_ICONS: Record<GuideRole, LucideIcon> = {
  ADMIN: ShieldCheck,
  EDITOR: ClipboardPen,
  VIEWER: Eye,
  GVCN: GraduationCap,
};

/** Small "#" link that puts the section in the address bar (copyable). */
function AnchorLink({ id, title }: { id: string; title: string }) {
  const nav = useGuideNav();
  return (
    <a
      href={`#${encodeURIComponent(id)}`}
      data-print-hide
      aria-label={`Liên kết tới mục “${title}”`}
      title="Liên kết tới mục này"
      onClick={(e) => {
        if (!nav || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        nav.goTo(id);
      }}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-slate-400 transition-colors hover:bg-surface-3 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:size-11"
    >
      <Link2 aria-hidden className="size-[18px]" strokeWidth={2.25} />
    </a>
  );
}

/* -------------------------------- Section -------------------------------- */

export interface SectionCardProps {
  section: GuideSection;
  /** Href of the described screen when the reader may open it (signed in, permitted). */
  screenHref?: string;
  hidden?: boolean;
}

export function SectionCard({ section, screenHref, hidden }: SectionCardProps) {
  const Icon = guideIcon(section.icon);
  const titleId = `${section.id}-tieu-de`;
  const screen = screenHref ? routeForPath(screenHref.split(/[?#]/)[0] || "/") : undefined;
  return (
    <section
      id={section.id}
      aria-labelledby={titleId}
      className={cn("card min-w-0 p-4 sm:p-7 print:break-inside-auto print:rounded-none print:border-0 print:p-0 print:pt-1", HIGHLIGHTABLE, hidden && FILTERED_OUT)}
    >
      {/* On paper: title and roles line stay together and with the summary (no lone heading at a page bottom). */}
      <header className="flex items-start gap-3.5 print:break-inside-avoid print:break-after-avoid">
        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 sm:size-11">
          <Icon className="size-5 sm:size-[22px]" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} data-guide-heading tabIndex={-1} className="text-[18px] font-bold leading-snug text-brand-900 outline-none sm:text-xl print:text-[14pt]">
            {section.title}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500 print:text-[9.5pt]">
            <UsersRound aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
            <span>
              <span className="sr-only">Dành cho: </span>
              {rolesText(section.roles)}
            </span>
          </p>
        </div>
        <AnchorLink id={section.id} title={section.title} />
      </header>
      <p className={cn(PROSE, "mt-4 font-medium text-slate-800")}>
        <InlineText text={section.summary} />
      </p>
      {section.blocks.length > 0 ? (
        <div className="mt-4 flex flex-col gap-5">
          {section.blocks.map((b, i) => (
            <GuideBlockView key={i} block={b} />
          ))}
        </div>
      ) : null}
      {screenHref ? (
        <footer data-print-hide className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Link href={screenHref} className={buttonClasses({ variant: "outline", size: "sm" })}>
            {screen ? `Mở màn hình ${screen.title}` : "Mở màn hình"}
            <ArrowRight aria-hidden strokeWidth={2.25} />
          </Link>
        </footer>
      ) : null}
    </section>
  );
}

/* --------------------------------- Group --------------------------------- */

export function GroupHeading({ id, headingId, label, count }: { id: string; headingId: string; label: string; count?: number }) {
  return (
    <div id={id} className={cn("flex items-center gap-3 rounded-control print:break-after-avoid", HIGHLIGHTABLE)}>
      <span aria-hidden className="h-7 w-1.5 shrink-0 rounded-full bg-brand-600" />
      <h2 id={headingId} data-guide-heading tabIndex={-1} className="min-w-0 text-[22px] font-bold leading-tight tracking-tight text-brand-900 outline-none sm:text-2xl print:text-[17pt]">
        {label}
      </h2>
      {count !== undefined ? (
        <Badge tone="muted" size="sm" className="ml-auto print:hidden">
          {count} mục
        </Badge>
      ) : null}
    </div>
  );
}

/* ------------------------------ Quick starts ----------------------------- */

function sectionTitle(sections: readonly GuideSection[], id: string): string | undefined {
  return sections.find((s) => s.id === id)?.title;
}

export function QuickStartCard({ qs, sections, mine }: { qs: GuideQuickStart; sections: readonly GuideSection[]; mine: boolean }) {
  const nav = useGuideNav();
  const Icon = ROLE_ICONS[qs.role] ?? UsersRound;
  const eyebrow = roleEyebrow(qs.role, qs.title);
  const related = qs.sectionIds.map((id) => ({ id, title: sectionTitle(sections, id) })).filter((r): r is { id: string; title: string } => !!r.title);
  return (
    <article
      id={quickStartAnchor(qs.role)}
      aria-labelledby={`${quickStartAnchor(qs.role)}-tieu-de`}
      className={cn("card flex min-w-0 flex-col p-5 sm:p-6 print:break-inside-avoid print:border-slate-300", HIGHLIGHTABLE, mine && "ring-2 ring-star-400/70")}
    >
      <header className="flex items-start gap-3">
        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-800 text-white">
          <Icon className="size-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          {eyebrow || mine ? (
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-brand-700">
              {eyebrow}
              {mine ? (
                <Badge tone="star" size="sm" className="normal-case tracking-normal" data-print-hide>
                  Vai trò của bạn
                </Badge>
              ) : null}
            </p>
          ) : null}
          <h3 id={`${quickStartAnchor(qs.role)}-tieu-de`} data-guide-heading tabIndex={-1} className={cn("text-[17px] font-bold leading-snug text-brand-900 outline-none print:text-[13pt]", eyebrow || mine ? "mt-0.5" : "pt-2")}>
            {qs.title}
          </h3>
        </div>
      </header>
      <p className={cn(PROSE, "mt-3")}>
        <InlineText text={qs.description} />
      </p>
      <StepList items={qs.steps} className="mt-4" />
      {related.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-[13px] font-semibold text-slate-600">Đọc tiếp</p>
          <ul role="list" className="mt-2 flex flex-wrap gap-2">
            {related.map((r) => (
              <li key={r.id}>
                <a
                  href={`#${encodeURIComponent(r.id)}`}
                  onClick={(e) => {
                    if (!nav || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    nav.goTo(r.id);
                  }}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-[13px] font-medium text-brand-800 ring-1 ring-inset ring-border transition-colors hover:bg-brand-50 hover:ring-brand-200 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:min-h-10"
                >
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

/* ---------------------------------- FAQ ---------------------------------- */

export function FaqList({
  faq,
  sections,
  match,
  searching,
}: {
  faq: readonly GuideFaq[];
  sections: readonly GuideSection[];
  /** Indexes shown while searching. */
  match: ReadonlySet<number>;
  searching: boolean;
}) {
  const nav = useGuideNav();
  // On paper the whole list is taller than a page: let it flow (each answer stays whole) instead of being pushed
  // below its heading as one block (globals.css avoids breaks inside every .card when printing).
  return (
    <div className="card divide-y divide-border overflow-hidden print:break-inside-auto print:overflow-visible print:border-slate-300">
      {faq.map((f, i) => {
        const hidden = searching && !match.has(i);
        const link = f.sectionId ? { id: f.sectionId, title: sectionTitle(sections, f.sectionId) } : undefined;
        return (
          <details
            // Remount when the search starts/stops so matches open and the reader's own toggles are respected.
            key={`${searching ? "s" : "n"}-${i}`}
            data-guide-faq=""
            open={searching && !hidden ? true : undefined}
            className={cn("group print:break-inside-avoid", hidden && FILTERED_OUT)}
          >
            <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 sm:px-5 [&::-webkit-details-marker]:hidden">
              <CircleQuestionMark aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-600" strokeWidth={2} />
              <span className="min-w-0 flex-1 text-[15px] font-semibold leading-6 text-brand-900 print:text-[11pt]">
                <InlineText text={f.q} />
              </span>
              <ChevronDown aria-hidden className="mt-0.5 size-5 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180 print:hidden" strokeWidth={2.25} />
            </summary>
            <div className="px-4 pb-4 pl-12 sm:px-5 sm:pl-[52px]">
              <p className={PROSE}>
                <InlineText text={f.a} />
              </p>
              {link?.title ? (
                <a
                  href={`#${encodeURIComponent(link.id)}`}
                  data-print-hide
                  onClick={(e) => {
                    if (!nav || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    nav.goTo(link.id);
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-sm text-[13px] font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  Xem mục “{link.title}”
                  <ArrowRight aria-hidden className="size-3.5" strokeWidth={2.25} />
                </a>
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/* -------------------------------- Glossary ------------------------------- */

export function GlossaryList({ glossary, match, searching }: { glossary: GuideContent["glossary"]; match: ReadonlySet<number>; searching: boolean }) {
  return (
    <dl className="card divide-y divide-border print:break-inside-auto print:border-slate-300">
      {glossary.map((g, i) => (
        <div
          key={`${g.term}-${i}`}
          className={cn(
            "grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:gap-5 sm:px-5 print:grid-cols-[150px_1fr] print:break-inside-avoid",
            searching && !match.has(i) && "hidden print:grid",
          )}
        >
          <dt className="text-[14px] font-semibold leading-6 text-brand-900 break-words print:text-[10.5pt]">{g.term}</dt>
          <dd className="text-[14px] leading-6 text-slate-700 break-words print:text-[10.5pt]">
            <InlineText text={g.definition} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
