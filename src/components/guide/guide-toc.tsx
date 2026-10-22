"use client";
import { ListTree } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/components/ui/cn";

export interface TocNode {
  id: string;
  label: string;
  children?: TocNode[];
}

export interface GuideTocProps {
  nodes: readonly TocNode[];
  /** Anchor currently being read (scroll spy). */
  activeId?: string;
  onNavigate: (id: string) => void;
  className?: string;
}

function contains(node: TocNode, id: string | undefined): boolean {
  return !!id && (node.id === id || (node.children ?? []).some((c) => contains(c, id)));
}

function TocLink({ node, active, sub, onNavigate }: { node: TocNode; active: boolean; sub: boolean; onNavigate: (id: string) => void }) {
  return (
    <a
      href={`#${encodeURIComponent(node.id)}`}
      aria-current={active ? "location" : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onNavigate(node.id);
      }}
      className={cn(
        "relative block rounded-lg py-1.5 pr-2 leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500",
        sub ? "pl-4 text-[13.5px]" : "pl-3 text-[14px] font-semibold",
        active ? "bg-brand-50 text-brand-700" : sub ? "text-slate-600 hover:bg-surface-3 hover:text-brand-900" : "text-brand-900 hover:bg-surface-3",
        // pointer-coarse: comfortable touch targets inside the phone sheet.
        "pointer-coarse:py-2.5",
      )}
    >
      {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand-600" /> : null}
      {node.label}
    </a>
  );
}

/** Grouped table of contents (desktop column and phone sheet). */
export function GuideToc({ nodes, activeId, onNavigate, className }: GuideTocProps) {
  return (
    <ol role="list" className={cn("flex flex-col gap-1", className)}>
      {nodes.map((n) => (
        <li key={n.id}>
          {n.children && n.children.length > 0 ? (
            <>
              <TocLink node={n} active={n.id === activeId} sub={false} onNavigate={onNavigate} />
              <ol role="list" className={cn("mb-1.5 ml-3 mt-0.5 flex flex-col gap-0.5 border-l pl-1", contains(n, activeId) ? "border-brand-200" : "border-border")}>
                {n.children.map((c) => (
                  <li key={c.id}>
                    <TocLink node={c} active={c.id === activeId} sub onNavigate={onNavigate} />
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <TocLink node={n} active={n.id === activeId} sub={false} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ol>
  );
}

/** Phones and tablets (< 1024px): the table of contents in a sheet opened from the top bar. */
export function GuideTocSheet({
  open,
  onOpenChange,
  nodes,
  activeId,
  onNavigate,
}: GuideTocProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Mục lục" description="Chọn một mục để chuyển tới phần hướng dẫn đó." icon={ListTree} size="sm">
      <nav aria-label="Mục lục">
        <GuideToc nodes={nodes} activeId={activeId} onNavigate={onNavigate} />
      </nav>
    </Sheet>
  );
}
