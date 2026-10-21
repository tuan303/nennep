"use client";
/** Collapsible, monospace JSON tree (native <details>, keyboard accessible). Text only – never renders HTML. */
import { useState } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button, cn } from "@/components/ui";

type Json = unknown;

const MAX_STRING = 400;

function isContainer(v: Json): v is Record<string, Json> | Json[] {
  return typeof v === "object" && v !== null;
}

function Primitive({ value }: { value: Json }) {
  if (value === null) return <span className="text-slate-400">null</span>;
  if (typeof value === "string") {
    const shown = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    return <span className="break-all text-emerald-700">&quot;{shown}&quot;</span>;
  }
  if (typeof value === "number") return <span className="text-star-800">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="text-brand-700">{String(value)}</span>;
  return <span className="text-slate-500">{String(value)}</span>;
}

function Key({ name }: { name?: string }) {
  if (name === undefined) return null;
  return <span className="text-slate-500">{name}: </span>;
}

function Node({ name, value, depth, expandAll }: { name?: string; value: Json; depth: number; expandAll: boolean }) {
  if (!isContainer(value)) {
    return (
      <div className="py-0.5 pl-5">
        <Key name={name} />
        <Primitive value={value} />
      </div>
    );
  }
  const isArray = Array.isArray(value);
  const entries: Array<[string, Json]> = isArray ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  const open = expandAll || depth < 2;
  const preview = isArray ? `[${entries.length}]` : `{${entries.length}}`;
  if (entries.length === 0) {
    return (
      <div className="py-0.5 pl-5">
        <Key name={name} />
        <span className="text-slate-400">{isArray ? "[]" : "{}"}</span>
      </div>
    );
  }
  return (
    <details open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded py-0.5 hover:bg-slate-900/[0.04] focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400 transition-transform [[open]>summary>&]:rotate-90" />
        <Key name={name} />
        <span className="text-slate-400">{preview}</span>
      </summary>
      <div className="ml-2 border-l border-border pl-1.5">
        {entries.map(([k, v]) => (
          <Node key={k} name={k} value={v} depth={depth + 1} expandAll={expandAll} />
        ))}
      </div>
    </details>
  );
}

export function JsonViewer({ value, className }: { value: Json; className?: string }) {
  const [expandAll, setExpandAll] = useState(false);
  const [version, setVersion] = useState(0);
  const toggle = () => {
    setExpandAll((x) => !x);
    setVersion((v) => v + 1); // remount so <details open> follows the toggle
  };
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" icon={expandAll ? ChevronsDownUp : ChevronsUpDown} onClick={toggle}>
          {expandAll ? "Thu gọn" : "Mở rộng tất cả"}
        </Button>
      </div>
      <div className="max-h-[50vh] overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-[12.5px] leading-5 ring-1 ring-inset ring-border">
        <Node key={version} value={value} depth={0} expandAll={expandAll} />
      </div>
    </div>
  );
}
