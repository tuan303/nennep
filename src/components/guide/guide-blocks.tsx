"use client";
import { Info, Lightbulb, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { GuideDemo } from "./guide-demos";
import { InlineText } from "./inline-text";
import type { GuideBlock } from "./types";

/** Body text: comfortable on screens, 11pt on paper. */
export const PROSE = "text-[15px] leading-7 text-slate-700 break-words print:text-[11pt] print:leading-normal";

function BlockTitle({ children }: { children: string }) {
  return <h4 className="mb-2.5 text-[15px] font-semibold text-brand-900 print:text-[11pt] print:break-after-avoid">{children}</h4>;
}

/* --------------------------------- Steps --------------------------------- */

export function StepList({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <ol role="list" className={cn("flex flex-col gap-3", className)}>
      {items.map((text, i) => (
        <li key={i} className="relative flex gap-3 print:break-inside-avoid">
          {/* Connector between the numbered circles. */}
          {i < items.length - 1 ? <span aria-hidden className="absolute -bottom-3 left-[13px] top-8 w-0.5 rounded-full bg-brand-100 print:hidden" /> : null}
          <span
            aria-hidden
            className="num relative mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[13px] font-bold text-white shadow-press print:shadow-none"
          >
            {i + 1}
          </span>
          <span className={cn(PROSE, "min-w-0 flex-1 pt-px")}>
            <InlineText text={text} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/* --------------------------------- Lists --------------------------------- */

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul role="list" className="flex flex-col gap-2">
      {items.map((text, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-brand-500" />
          <span className={cn(PROSE, "min-w-0 flex-1")}>
            <InlineText text={text} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- Callouts ------------------------------- */

type CalloutKind = "tip" | "note" | "warn";

const CALLOUT: Record<CalloutKind, { icon: LucideIcon; label: string; box: string; tile: string; title: string }> = {
  tip: { icon: Lightbulb, label: "Mẹo", box: "bg-star-50 ring-star-500/30", tile: "bg-star-100 text-star-800", title: "text-star-900" },
  note: { icon: Info, label: "Lưu ý", box: "bg-surface-2 ring-brand-800/15", tile: "bg-brand-800/10 text-brand-800", title: "text-brand-900" },
  warn: { icon: TriangleAlert, label: "Quan trọng", box: "bg-warn-soft ring-warn/30", tile: "bg-warn/15 text-warn-strong", title: "text-warn-strong" },
};

export function Callout({ kind, title, text }: { kind: CalloutKind; title?: string; text: string }) {
  const look = CALLOUT[kind];
  const Icon = look.icon;
  return (
    <aside className={cn("flex gap-3 rounded-card p-4 ring-1 ring-inset print:break-inside-avoid", look.box)}>
      <span aria-hidden className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", look.tile)}>
        <Icon className="size-[18px]" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        {/* The kind is always written out (colour is never the only signal). */}
        <p className={cn("text-[14px] font-semibold leading-6 print:text-[11pt]", look.title)}>
          {title ? (
            <>
              <span className="sr-only">{look.label}: </span>
              {title}
            </>
          ) : (
            look.label
          )}
        </p>
        <p className={cn(PROSE, "mt-0.5")}>
          <InlineText text={text} />
        </p>
      </div>
    </aside>
  );
}

/* --------------------------------- Tables -------------------------------- */

export interface GuideTableProps {
  head: readonly string[];
  rows: ReadonlyArray<readonly string[]>;
  caption?: string;
}

/** Long tables may continue on the next printed page (rows stay whole, the header repeats) instead of leaving a gap. */
const PRINT_SPLIT_ROWS = 6;

/** Table on ≥ 640px and on paper; one card per row on phones (no horizontal scrolling). */
export function GuideTable({ head, rows, caption }: GuideTableProps) {
  return (
    // `!` beats the global unlayered `@media print { figure { break-inside: avoid } }`; short tables stay whole.
    <figure className={cn("min-w-0", rows.length > PRINT_SPLIT_ROWS && "print:break-inside-auto!")}>
      <div className="hidden overflow-x-auto rounded-card bg-surface ring-1 ring-border sm:block print:block print:overflow-visible">
        <table className="w-full border-collapse text-left">
          <thead className="bg-surface-2">
            <tr>
              {head.map((h, i) => (
                <th key={i} scope="col" className="border-b border-border px-4 py-2.5 align-bottom text-xs font-semibold uppercase tracking-[0.06em] text-slate-600 print:text-[9.5pt]">
                  <InlineText text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, r) => (
              <tr key={r} className="align-top">
                {row.map((cell, c) =>
                  c === 0 ? (
                    <th key={c} scope="row" className="px-4 py-3 text-[14px] font-semibold leading-6 text-brand-900 print:text-[10.5pt]">
                      <InlineText text={cell} />
                    </th>
                  ) : (
                    <td key={c} className="px-4 py-3 text-[14px] leading-6 text-slate-700 print:text-[10.5pt]">
                      <InlineText text={cell} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul role="list" className="flex flex-col gap-2 sm:hidden print:hidden">
        {rows.map((row, r) => (
          <li key={r} className="rounded-card bg-surface p-3.5 ring-1 ring-border">
            <p className="text-[14px] font-semibold leading-6 text-brand-900 break-words">
              <InlineText text={row[0] ?? ""} />
            </p>
            {row.length > 1 ? (
              <dl className="mt-1.5 flex flex-col gap-1.5">
                {row.slice(1).map((cell, c) => (
                  <div key={c} className="min-w-0">
                    {head[c + 1] ? (
                      <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                        <InlineText text={head[c + 1]} />
                      </dt>
                    ) : null}
                    <dd className="text-[14px] leading-6 text-slate-700 [overflow-wrap:anywhere]">
                      <InlineText text={cell} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
      {caption ? (
        <figcaption className="mt-2 text-[13px] leading-5 text-slate-500 print:text-[9.5pt]">
          <InlineText text={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

/* ---------------------------------- Demo --------------------------------- */

function DemoFrame({ demo, caption }: Extract<GuideBlock, { kind: "demo" }>) {
  return (
    <figure className="min-w-0 rounded-card border border-dashed border-border-strong bg-surface-2 p-3 sm:p-5 print:break-inside-avoid">
      <p className="mb-3 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.12em] text-slate-500">
        <Sparkles aria-hidden className="size-3.5 text-star-600" strokeWidth={2.25} />
        Minh họa · dữ liệu mẫu
      </p>
      <GuideDemo demo={demo} />
      {caption ? (
        <figcaption className="mt-3 text-[13px] leading-5 text-slate-600 print:text-[9.5pt]">
          <InlineText text={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

/* --------------------------------- Switch -------------------------------- */

export function GuideBlockView({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className={PROSE}>
          <InlineText text={block.text} />
        </p>
      );
    case "steps":
      return (
        <div>
          {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
          <StepList items={block.items} />
        </div>
      );
    case "list":
      return (
        <div>
          {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
          <BulletList items={block.items} />
        </div>
      );
    case "tip":
    case "note":
    case "warn":
      return <Callout kind={block.kind} title={block.title} text={block.text} />;
    case "table":
      return <GuideTable head={block.head} rows={block.rows} caption={block.caption} />;
    case "demo":
      return <DemoFrame {...block} />;
    default:
      return null;
  }
}
