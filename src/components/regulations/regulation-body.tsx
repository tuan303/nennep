/**
 * Renders a parsed regulation body (src/lib/regulations/markup.ts): chapters, articles with anchors, lists that keep
 * their written numbers, tables (stacked cards on phones from 3 columns on, the table itself on paper), notes, bold.
 * No hooks – shared by the reader, the editor preview and SSR tests.
 */
import { Fragment } from "react";
import { Info } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { parseInline, type RegulationBlock } from "@/lib/regulations/markup";

/** Attribute that scopes the print rules (regulation-print.tsx) to the document. */
export const REGULATION_DOC_ATTR = "data-regulation-doc";

/** Below the sticky top bar when jumping to an anchor. */
const ANCHOR = "scroll-mt-24 rounded-md data-[highlight=true]:bg-star-50 data-[highlight=true]:ring-4 data-[highlight=true]:ring-star-50 transition-colors";

export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-slate-900">
            {part.text}
          </strong>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

function TableBlock({ head, rows }: { head: string[]; rows: string[][] }) {
  const cards = head.length >= 3 && rows.length > 0;
  return (
    <div data-keep className="mt-4">
      <div className={cn("overflow-x-auto rounded-control ring-1 ring-inset ring-border", cards && "max-sm:hidden print:block")}>
        <table className="w-full border-collapse text-left text-[13.5px] leading-snug">
          <thead className="bg-surface-3">
            <tr>
              {head.map((h, i) => (
                <th key={i} scope="col" className="border-b border-border px-3 py-2 align-bottom font-semibold text-brand-900">
                  <InlineText text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-border first:border-t-0 even:bg-surface-2">
                {row.map((cell, c) => (
                  <td key={c} className="px-3 py-2 align-top text-slate-800">
                    <InlineText text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cards ? (
        // Phones: one card per row, "header: value" pairs – no sideways scrolling inside the article.
        <ul role="list" className="flex flex-col gap-2 sm:hidden print:hidden">
          {rows.map((row, r) => (
            <li key={r} className="rounded-control bg-surface p-3 ring-1 ring-inset ring-border">
              <dl className="flex flex-col gap-1.5">
                {row.map((cell, c) =>
                  cell || head[c] ? (
                    <div key={c} className="min-w-0">
                      {head[c] ? (
                        <dt className="text-xs font-semibold text-slate-500">
                          <InlineText text={head[c]} />
                        </dt>
                      ) : null}
                      <dd className={cn("text-[14px] leading-snug text-slate-800", c === 0 && "font-semibold text-brand-900")}>
                        {cell ? <InlineText text={cell} /> : "–"}
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Block({ block, anchors }: { block: RegulationBlock; anchors: boolean }) {
  switch (block.kind) {
    case "chapter":
      return (
        <h2
          id={anchors ? block.id : undefined}
          className={cn(ANCHOR, "mt-10 text-balance text-center text-[16px] font-bold uppercase leading-snug tracking-wide text-brand-900 sm:text-[17px]")}
        >
          <InlineText text={block.text} />
        </h2>
      );
    case "article":
      return (
        <h3 id={anchors ? block.id : undefined} className={cn(ANCHOR, "mt-7 text-[15.5px] font-bold leading-snug text-brand-900")}>
          <InlineText text={block.text} />
        </h3>
      );
    case "paragraph":
      return (
        <p className="mt-3 text-pretty">
          <InlineText text={block.text} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag role="list" className={cn("mt-2.5 flex flex-col gap-1.5", block.nested && "ml-8 mt-1.5")}>
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              {block.ordered ? (
                <span className="num min-w-6 shrink-0 font-semibold text-slate-600">{item.marker}</span>
              ) : (
                <span aria-hidden className="w-4 shrink-0 text-center text-slate-500">
                  •
                </span>
              )}
              <span className="min-w-0 flex-1">
                <InlineText text={item.text} />
              </span>
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return <TableBlock head={block.head} rows={block.rows} />;
    case "note":
      return (
        <div role="note" data-keep className="mt-4 flex gap-2.5 rounded-control bg-star-50 px-3.5 py-3 ring-1 ring-inset ring-star-200">
          <Info aria-hidden className="mt-0.5 size-[18px] shrink-0 text-star-700" strokeWidth={2.25} />
          <div className="flex min-w-0 flex-col gap-1.5 text-[14.5px]">
            {block.paragraphs.map((p, i) => (
              <p key={i}>
                <InlineText text={p} />
              </p>
            ))}
          </div>
        </div>
      );
  }
}

export interface RegulationBodyProps {
  blocks: readonly RegulationBlock[];
  /** Heading ids for the table of contents (off in the editor preview, so ids stay unique on the page). */
  anchors?: boolean;
  className?: string;
}

export function RegulationBody({ blocks, anchors = true, className }: RegulationBodyProps) {
  return (
    <div className={cn("text-[15px] leading-relaxed text-slate-800 [&>:first-child]:mt-0", className)}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} anchors={anchors} />
      ))}
    </div>
  );
}
