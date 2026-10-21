"use client";

import * as Popover from "@radix-ui/react-popover";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Pill } from "./badge";
import { Button } from "./button";
import { cn } from "./cn";
import { OptionList, type ComboOption, type OptionRenderState } from "./combobox-list";
import { useFieldControl } from "./field";
import { useIsMobile } from "./hooks";
import { Sheet } from "./sheet";

export interface MultiComboboxProps<T extends string> {
  options: ReadonlyArray<ComboOption<T>>;
  value: readonly T[];
  onChange: (value: T[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  renderOption?: (option: ComboOption<T>, state: OptionRenderState) => ReactNode;
  /** Text of a selected chip (default: option label). */
  chipLabel?: (option: ComboOption<T>) => string;
  /** Shows "Chọn tất cả (n)" for the options currently visible (after search). */
  selectAllVisible?: boolean;
  /** Chips shown before collapsing into "+N" (default 6). */
  maxChips?: number;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  title?: string;
  limit?: number;
  className?: string;
}

/** Searchable multi select: chips for the selection, checkbox rows, optional "select all visible". */
export function MultiCombobox<T extends string>({
  options,
  value,
  onChange,
  placeholder = "Chọn…",
  searchPlaceholder = "Gõ để tìm…",
  emptyText = "Không tìm thấy kết quả phù hợp",
  renderOption,
  chipLabel,
  selectAllVisible,
  maxChips = 6,
  disabled,
  invalid,
  id,
  "aria-label": ariaLabel,
  title,
  limit = 200,
  className,
}: MultiComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isMobile = useIsMobile();
  const a11y = useFieldControl({ id, invalid });
  const selectedSet = useMemo(() => new Set<T>(value), [value]);
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o] as const)), [options]);
  const selectedOptions = value.map((v) => byValue.get(v)).filter((o): o is ComboOption<T> => !!o);

  const setOpenAndReset = (v: boolean) => {
    setOpen(v);
    if (!v) setQuery("");
  };
  const toggle = (v: T) => onChange(selectedSet.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  const header = selectAllVisible
    ? (visible: ReadonlyArray<ComboOption<T>>) => {
        const enabled = visible.filter((o) => !o.disabled);
        if (enabled.length === 0) return null;
        const allOn = enabled.every((o) => selectedSet.has(o.value));
        return (
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-[13px]">
            <span className="num text-slate-500">Đã chọn {value.length}</span>
            <button
              type="button"
              className="rounded-md px-2 py-1.5 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
              onClick={() => {
                if (allOn) {
                  const drop = new Set(enabled.map((o) => o.value));
                  onChange(value.filter((v) => !drop.has(v)));
                } else {
                  const add = enabled.map((o) => o.value).filter((v) => !selectedSet.has(v));
                  onChange([...value, ...add]);
                }
              }}
            >
              {allOn ? `Bỏ chọn ${query ? "kết quả" : "tất cả"}` : `Chọn ${query ? "kết quả" : "tất cả"} (${enabled.length})`}
            </button>
          </div>
        );
      }
    : undefined;

  const list = (
    <OptionList
      options={options}
      query={query}
      onQueryChange={setQuery}
      isSelected={(v) => selectedSet.has(v)}
      onSelect={toggle}
      renderOption={renderOption}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      limit={limit}
      multiple
      header={header}
      label={ariaLabel ?? title ?? placeholder}
      autoFocus={!isMobile || options.length > 12}
      listClassName={isMobile ? "max-h-[55dvh]" : "max-h-[min(340px,var(--radix-popover-content-available-height,340px))]"}
    />
  );

  const shown = selectedOptions.slice(0, maxChips);
  const hidden = selectedOptions.length - shown.length;

  const triggerButton = (
    <button
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label={ariaLabel}
      disabled={disabled}
      {...a11y}
      onClick={isMobile ? () => setOpenAndReset(true) : undefined}
      className="flex h-8 min-w-[7rem] flex-1 items-center justify-between gap-2 rounded-md pl-1.5 pr-1 text-left text-base text-slate-400 outline-none focus-visible:outline-2 focus-visible:outline-brand-500 sm:text-sm pointer-coarse:h-9"
    >
      <span className="truncate">{selectedOptions.length ? "Thêm…" : placeholder}</span>
      <ChevronDown aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
    </button>
  );

  const box = (
    <div
      className={cn(
        "flex min-h-11 w-full min-w-0 flex-wrap items-center gap-1.5 rounded-control border border-border-strong bg-surface p-1.5 shadow-xs transition-[border-color,box-shadow] sm:min-h-10",
        "hover:border-slate-400 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15",
        a11y["aria-invalid"] && "border-bad",
        open && "border-brand-500 ring-4 ring-brand-500/15",
        disabled && "pointer-events-none bg-surface-3 opacity-60",
      )}
    >
      {shown.map((o) => (
        <Pill key={o.value} className="h-7" onRemove={() => toggle(o.value)} removeLabel={`Bỏ ${o.label}`} disabled={disabled}>
          {chipLabel ? chipLabel(o) : o.label}
        </Pill>
      ))}
      {hidden > 0 ? <span className="num rounded-full bg-muted-soft px-2.5 py-1 text-xs font-semibold text-muted-strong">+{hidden}</span> : null}
      {isMobile ? triggerButton : <Popover.Trigger asChild>{triggerButton}</Popover.Trigger>}
    </div>
  );

  if (isMobile) {
    return (
      <div className={cn("min-w-0", className)}>
        {box}
        <Sheet
          open={open}
          onOpenChange={setOpenAndReset}
          side="bottom"
          title={title ?? ariaLabel ?? placeholder}
          bodyClassName="p-0 sm:p-0"
          footer={
            <>
              <Button variant="ghost" onClick={() => onChange([])} disabled={value.length === 0}>
                Bỏ chọn tất cả
              </Button>
              <Button onClick={() => setOpenAndReset(false)}>Xong ({value.length})</Button>
            </>
          }
        >
          {list}
        </Sheet>
      </div>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpenAndReset}>
      <Popover.Anchor asChild>
        <div className={cn("min-w-0", className)}>{box}</div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-[280px] max-w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-xl border border-border bg-surface shadow-pop outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-scale-in"
        >
          {list}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
