"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "./cn";
import { controlBase, controlHeight } from "./control-styles";
import { useFieldControl } from "./field";

export interface SearchInputProps {
  /** Committed (debounced) value. */
  value: string;
  /** Called `delay` ms after typing stops, immediately on Enter / clear. */
  onChange: (value: string) => void;
  delay?: number;
  placeholder?: string;
  /** Accessible name when there is no visible <Field> label. Default "Tìm kiếm". */
  ariaLabel?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
  id?: string;
  className?: string;
}

/** Debounced search box with a clear button. Esc clears. */
export function SearchInput({
  value,
  onChange,
  delay = 250,
  placeholder = "Tìm kiếm…",
  ariaLabel = "Tìm kiếm",
  size = "md",
  autoFocus,
  id,
  className,
}: SearchInputProps) {
  const [text, setText] = useState(value);
  const emitted = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const a11y = useFieldControl({ id });

  // External resets (e.g. "Xóa bộ lọc") update the box.
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function commit(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (next !== emitted.current) {
      emitted.current = next;
      onChange(next);
    }
  }

  function schedule(next: string) {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), delay);
  }

  return (
    <div role="search" className={cn("relative flex min-w-0 items-center", className)}>
      <Search aria-hidden className="pointer-events-none absolute left-3 size-[18px] text-slate-400" strokeWidth={2} />
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-label={a11y.id ? undefined : ariaLabel}
        {...a11y}
        value={text}
        placeholder={placeholder}
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(text);
          if (e.key === "Escape" && text) {
            e.preventDefault();
            setText("");
            commit("");
          }
        }}
        className={cn(controlBase, controlHeight[size], "pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none")}
      />
      {text ? (
        <button
          type="button"
          aria-label="Xóa tìm kiếm"
          onClick={() => {
            setText("");
            commit("");
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:size-10"
        >
          <X aria-hidden className="size-4" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}
