"use client";
/**
 * Reading view of a quy chế: switch between the two, page header (năm học, "Cập nhật lúc …", In / Tải bản PDF gốc /
 * Sửa), sticky table of contents of the Điều (sheet on phones and tablets), the document, the empty state.
 * Presentational – data, permissions and actions come from regulation-screen.tsx.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Download, FileText, ListTree, PencilLine, Printer } from "lucide-react";
import { REGULATION_ICONS, REGULATION_NAV_ITEMS } from "@/components/app/shell/nav-config";
import { regulationHref } from "@/components/app/shell/routes";
import { GuideToc } from "@/components/guide/guide-toc";
import { Button, Card, EmptyState, PageHeader, Sheet, cn } from "@/components/ui";
import { REGULATION_LABELS, SCHOOL_NAME } from "@/lib/constants";
import type { ParsedRegulation } from "@/lib/regulations/markup";
import type { Regulation, RegulationId } from "@/lib/types";
import { regulationUpdatedLine } from "./lib/regulation-form";
import { REGULATION_DOC_ATTR, RegulationBody } from "./regulation-body";

/** "Quy chế khen thưởng | Quy chế kỷ luật" as links (in-app navigation, so the unsaved-edits guard can ask first). */
export function RegulationSwitch({ current, className }: { current: RegulationId; className?: string }) {
  const currentHref = regulationHref(current);
  return (
    <nav
      aria-label="Chọn quy chế"
      data-print-hide
      className={cn("inline-flex max-w-full items-stretch gap-0.5 rounded-control bg-surface-3 p-1 ring-1 ring-inset ring-border", className)}
    >
      {REGULATION_NAV_ITEMS.map((it) => {
        const active = it.href === currentHref;
        const Icon = it.icon;
        return (
          <Link
            key={it.id}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 sm:flex-none",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 pointer-coarse:h-11",
              active ? "bg-surface text-brand-800 shadow-sm ring-1 ring-border" : "text-slate-600 hover:bg-white/60 hover:text-brand-900",
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
            <span className="truncate sm:hidden">{it.shortLabel}</span>
            <span className="hidden truncate sm:inline">{it.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export interface RegulationHeaderProps {
  id: RegulationId;
  regulation?: Regulation;
  /** Buttons on the right (hidden when printing). */
  actions?: ReactNode;
  /** The list is still loading: no "Chưa có nội dung" line yet. */
  loading?: boolean;
}

/** Page header: eyebrow "Toàn trường · Năm học …", title, "Cập nhật lúc … – …". Not printed (the document has its own). */
export function RegulationHeader({ id, regulation, actions, loading }: RegulationHeaderProps) {
  const updated = regulationUpdatedLine(regulation);
  return (
    <div data-print-hide>
      <PageHeader
        icon={REGULATION_ICONS[id]}
        eyebrow={regulation?.schoolYear ? `Toàn trường · Năm học ${regulation.schoolYear}` : "Toàn trường"}
        title={regulation?.title || REGULATION_LABELS[id].title}
        description={updated ?? (loading ? "Đang tải quy chế…" : "Chưa có nội dung trên phần mềm.")}
        actions={actions}
      />
    </div>
  );
}

export interface RegulationActionsProps {
  regulation?: Regulation;
  hasContent: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onPrint: () => void;
  onDownloadPdf: () => void;
  downloading?: boolean;
}

/**
 * Sửa (regulations.manage) · Tải bản PDF gốc (when uploaded) · In – once there is content (the empty state carries its
 * own "Soạn nội dung" / "Tải bản PDF gốc").
 */
export function RegulationActions({ regulation, hasContent, canEdit, onEdit, onPrint, onDownloadPdf, downloading }: RegulationActionsProps) {
  if (!hasContent) return null;
  return (
    <>
      {canEdit ? (
        <Button variant="outline" icon={PencilLine} onClick={onEdit}>
          Sửa
        </Button>
      ) : null}
      {regulation?.pdf ? (
        <Button variant="secondary" icon={Download} loading={downloading} onClick={onDownloadPdf} title={regulation.pdf.name}>
          Tải bản PDF gốc
        </Button>
      ) : null}
      <Button variant="secondary" icon={Printer} onClick={onPrint}>
        In
      </Button>
    </>
  );
}

export interface RegulationDocumentProps {
  id: RegulationId;
  regulation: Regulation;
  parsed: ParsedRegulation;
  /** Anchor at the top of the reading area (table of contents marker). */
  activeAnchor?: string;
  onNavigate: (anchor: string) => void;
}

/** Table of contents (sticky column ≥ 1024px, "Mục lục" sheet below) + the document (A4-friendly when printed). */
export function RegulationDocument({ id, regulation, parsed, activeAnchor, onNavigate }: RegulationDocumentProps) {
  const [tocOpen, setTocOpen] = useState(false);
  const hasToc = parsed.toc.length > 0;
  const tocTitle = parsed.articleCount > 0 ? `Mục lục · ${parsed.articleCount} điều` : "Mục lục";
  const navigateFromSheet = (anchor: string) => {
    setTocOpen(false);
    // Let the sheet finish closing (scroll lock, focus return) before scrolling.
    window.setTimeout(() => onNavigate(anchor), 320);
  };

  return (
    // print:block – the table of contents is not printed: a wide print layout must not squeeze the text into its column.
    <div className={cn("grid items-start gap-4 sm:gap-5 print:block", hasToc && "lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[272px_minmax(0,1fr)] xl:gap-8")}>
      {hasToc ? (
        <>
          <aside data-print-hide className="sticky top-24 hidden lg:block">
            <nav aria-label="Mục lục" className="no-scrollbar max-h-[calc(100dvh-8rem)] overflow-y-auto pb-4">
              <p className="mb-2 px-3 text-2xs font-bold uppercase tracking-[0.14em] text-slate-500">{tocTitle}</p>
              <GuideToc nodes={parsed.toc} activeId={activeAnchor} onNavigate={onNavigate} />
            </nav>
          </aside>
          <div data-print-hide className="lg:hidden">
            <Button variant="secondary" size="sm" icon={ListTree} onClick={() => setTocOpen(true)} aria-haspopup="dialog">
              {tocTitle}
            </Button>
          </div>
          <Sheet open={tocOpen} onOpenChange={setTocOpen} title="Mục lục" description="Chọn một điều để chuyển tới." icon={ListTree} size="sm">
            <nav aria-label="Mục lục">
              <GuideToc nodes={parsed.toc} activeId={activeAnchor} onNavigate={navigateFromSheet} />
            </nav>
          </Sheet>
        </>
      ) : null}
      <article
        {...{ [REGULATION_DOC_ATTR]: id }}
        aria-label={regulation.title}
        className="card min-w-0 max-w-[880px] p-4 sm:p-7 lg:p-9 print:break-inside-auto"
      >
        {/* Paper header (the page header is not printed). */}
        <div className="mb-6 hidden text-center print:block">
          <p className="text-[10pt] font-semibold uppercase tracking-wide">{SCHOOL_NAME}</p>
          <p className="mt-3 text-[15pt] font-bold uppercase leading-snug">{regulation.title}</p>
          {regulation.schoolYear ? <p className="mt-1 text-[10.5pt] italic">Năm học {regulation.schoolYear}</p> : null}
        </div>
        <RegulationBody blocks={parsed.blocks} />
      </article>
    </div>
  );
}

export interface RegulationEmptyProps {
  canEdit: boolean;
  onCompose: () => void;
  /** Extra action (e.g. "Tải bản PDF gốc" when only the PDF exists). */
  extra?: ReactNode;
}

/** No content yet: readers are told to come back later; the admin gets "Soạn nội dung". */
export function RegulationEmpty({ canEdit, onCompose, extra }: RegulationEmptyProps) {
  return (
    <Card padding="none">
      <EmptyState
        icon={FileText}
        title="Chưa có nội dung quy chế"
        description={
          canEdit
            ? "Soạn nội dung để mọi tài khoản cùng đọc trên phần mềm; có thể tải kèm file PDF gốc của nhà trường."
            : extra
              ? "Nội dung quy chế chưa được đưa lên phần mềm; thầy/cô có thể tải bản PDF gốc của nhà trường."
              : "Nhà trường chưa cập nhật nội dung quy chế này trên phần mềm. Vui lòng quay lại sau."
        }
        action={
          canEdit || extra ? (
            <>
              {canEdit ? (
                <Button icon={PencilLine} onClick={onCompose}>
                  Soạn nội dung
                </Button>
              ) : null}
              {extra}
            </>
          ) : undefined
        }
      />
    </Card>
  );
}
