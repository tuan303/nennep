"use client";

import { Command } from "cmdk";
import { useMemo, useState, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "./cn";
import { buildSearchIndex, groupOptions, searchOptions } from "./search";

export interface ComboOption<T extends string = string> {
  value: T;
  label: string;
  /** Extra search terms (e.g. student id, teacher name). Accent-insensitive. */
  keywords?: string[];
  /** Group heading (e.g. "Khối 6", "Chuyên cần – vệ sinh"). */
  group?: string;
  /** Second line under the label. */
  description?: string;
  disabled?: boolean;
}

export interface OptionRenderState {
  selected: boolean;
}

export interface OptionListProps<T extends string> {
  options: ReadonlyArray<ComboOption<T>>;
  query: string;
  onQueryChange: (q: string) => void;
  isSelected: (value: T) => boolean;
  onSelect: (value: T) => void;
  renderOption?: (option: ComboOption<T>, state: OptionRenderState) => ReactNode;
  searchPlaceholder: string;
  emptyText: string;
  /** Max rendered items (performance on long lists). */
  limit: number;
  multiple?: boolean;
  /** Row above the list (e.g. "Chọn tất cả"). Receives the currently visible options. */
  header?: (visible: ReadonlyArray<ComboOption<T>>) => ReactNode;
  autoFocus?: boolean;
  listClassName?: string;
  label?: string;
}

/** Shared cmdk list used by Combobox and MultiCombobox (popover on desktop, bottom sheet on phones). */
export function OptionList<T extends string>({
  options,
  query,
  onQueryChange,
  isSelected,
  onSelect,
  renderOption,
  searchPlaceholder,
  emptyText,
  limit,
  multiple,
  header,
  autoFocus,
  listClassName,
  label,
}: OptionListProps<T>) {
  const index = useMemo(() => buildSearchIndex(options), [options]);
  const { items, total } = useMemo(() => searchOptions(index, query, limit), [index, query, limit]);
  const groups = useMemo(() => groupOptions(items), [items]);

  // With shouldFilter={false} cmdk does not re-highlight when our own search changes the list, so Enter
  // could pick an item highlighted before typing (e.g. "6a01" + Enter selected 6A0M). The highlight is
  // therefore derived from the visible list: the user's arrow-key choice is kept only for that same list,
  // otherwise the current value (empty query) or the first enabled match is highlighted.
  const [highlight, setHighlight] = useState<{ items: typeof items; value: string } | null>(null);
  const fallback = useMemo(() => {
    const enabled = items.filter((o) => !o.disabled);
    const current = query.trim() === "" ? enabled.find((o) => isSelected(o.value)) : undefined;
    return (current ?? enabled[0])?.value ?? "";
  }, [items, query, isSelected]);
  const active = highlight && highlight.items === items ? highlight.value : fallback;

  return (
    <Command
      shouldFilter={false}
      loop
      label={label}
      value={active}
      onValueChange={(v) => setHighlight({ items, value: v })}
      className="flex min-h-0 flex-col"
    >
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search aria-hidden className="size-4 shrink-0 text-slate-400" strokeWidth={2.25} />
        <Command.Input
          value={query}
          onValueChange={onQueryChange}
          placeholder={searchPlaceholder}
          autoFocus={autoFocus}
          className="h-11 w-full min-w-0 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
        />
      </div>
      {header ? header(items) : null}
      <Command.List className={cn("min-h-0 overflow-y-auto overscroll-contain p-1.5", listClassName)}>
        {items.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-slate-500">{emptyText}</div>
        ) : (
          groups.map((g) => (
            <Command.Group
              key={g.group || "_"}
              heading={g.group || undefined}
              className="[&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-[1] [&_[cmdk-group-heading]]:bg-surface/95 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-400 [&_[cmdk-group-heading]]:backdrop-blur"
            >
              {g.items.map((o) => {
                const selected = isSelected(o.value);
                return (
                  <Command.Item
                    key={o.value}
                    value={o.value}
                    disabled={o.disabled}
                    onSelect={() => onSelect(o.value)}
                    className={cn(
                      "flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-800 outline-none pointer-coarse:min-h-11",
                      "data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-900 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45",
                    )}
                  >
                    {multiple ? (
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
                          selected ? "border-brand-600 bg-brand-600 text-white" : "border-border-strong bg-surface",
                        )}
                      >
                        {selected ? <Check className="size-3" strokeWidth={3.5} /> : null}
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      {renderOption ? (
                        renderOption(o, { selected })
                      ) : (
                        <>
                          <div className={cn("truncate", selected && "font-semibold")}>{o.label}</div>
                          {o.description ? <div className="truncate text-xs text-slate-500">{o.description}</div> : null}
                        </>
                      )}
                    </div>
                    {!multiple && selected ? <Check aria-hidden className="size-4 shrink-0 text-brand-600" strokeWidth={2.75} /> : null}
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))
        )}
        {total > items.length ? (
          <p className="num px-3 py-2 text-center text-xs text-slate-500">
            Đang hiện {items.length}/{total} kết quả – gõ thêm để thu hẹp
          </p>
        ) : null}
      </Command.List>
    </Command>
  );
}
