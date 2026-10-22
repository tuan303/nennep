"use client";
import Link from "next/link";
import { Fragment, useMemo, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { guideAnchorOf, useGuideNav } from "./guide-hooks";
import { parseInline, type InlineNode } from "./inline";

export type InlineTone = "light" | "onDark";

const LOOK: Record<InlineTone, { bold: string; code: string; chip: string; link: string }> = {
  light: {
    bold: "font-semibold text-brand-900",
    code: "rounded-md bg-surface-3 px-1.5 py-px font-mono text-[0.88em] text-brand-900 ring-1 ring-inset ring-border",
    // "Button pill": the label of a button / tab / field exactly as shown in the app.
    chip:
      "rounded-full bg-surface px-2 py-px text-[0.86em] font-semibold text-brand-800 shadow-xs ring-1 ring-inset ring-border-strong print:shadow-none",
    link: "font-semibold text-brand-700 underline decoration-brand-300 decoration-1 underline-offset-[3px] hover:decoration-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 rounded-sm print:text-brand-900 print:no-underline",
  },
  onDark: {
    bold: "font-semibold text-white",
    code: "rounded-md bg-white/10 px-1.5 py-px font-mono text-[0.88em] text-white ring-1 ring-inset ring-white/20",
    chip: "rounded-full bg-white/10 px-2 py-px text-[0.86em] font-semibold text-white ring-1 ring-inset ring-white/30",
    link: "font-semibold text-star-300 underline decoration-star-300/50 underline-offset-[3px] hover:decoration-star-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-star-400 rounded-sm",
  },
};

function InlineLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const nav = useGuideNav();
  const anchor = guideAnchorOf(href);
  if (anchor) {
    return (
      <a
        href={`#${encodeURIComponent(anchor)}`}
        className={className}
        onClick={(e) => {
          if (!nav || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          nav.goTo(anchor);
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function renderNodes(nodes: readonly InlineNode[], tone: InlineTone): ReactNode {
  const look = LOOK[tone];
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return <Fragment key={i}>{n.text}</Fragment>;
      case "bold":
        return (
          <strong key={i} className={look.bold}>
            {renderNodes(n.children, tone)}
          </strong>
        );
      case "code":
        return (
          <code key={i} className={cn(look.code, "box-decoration-clone [overflow-wrap:anywhere]")}>
            {n.text}
          </code>
        );
      case "chip":
        return (
          // Short UI labels never split across lines; a long one may wrap (cloned padding keeps it readable).
          <span key={i} data-ui-label="" className={cn(look.chip, n.text.length <= 28 ? "whitespace-nowrap" : "box-decoration-clone")}>
            {n.text}
          </span>
        );
      case "link":
        return (
          <InlineLink key={i} href={n.href} className={cn(look.link, "[overflow-wrap:anywhere]")}>
            {n.text}
          </InlineLink>
        );
    }
  });
}

export interface InlineTextProps {
  /** Guide text with inline markup: **bold**, `code`, [[Nút]], [text](/route). */
  text: string;
  tone?: InlineTone;
}

/** Renders one line of guide text (no wrapper element – place it inside a <p>, <li>, <td>…). */
export function InlineText({ text, tone = "light" }: InlineTextProps) {
  const nodes = useMemo(() => parseInline(text), [text]);
  return <>{renderNodes(nodes, tone)}</>;
}
