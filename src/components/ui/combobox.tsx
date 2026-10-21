"use client";

import * as Popover from "@radix-ui/react-popover";
import { useState, type ReactNode } from "react";
import { ChevronsUpDown, X, type LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { OptionList, type ComboOption, type OptionRenderState } from "./combobox-list";
import { controlBase, controlHeight } from "./control-styles";
import { useFieldControl } from "./field";
import { useIsMobile } from "./hooks";
import { Sheet } from "./sheet";

export type { ComboOption, OptionRenderState };

export interface ComboboxProps<T extends string> {
  options: ReadonlyArray<ComboOption<T>>;
  value: T | undefined | null;
  /** undefined when cleared. */
  onChange: (value: T | undefined) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Custom option row (rich content). The check mark is added by the kit. */
  renderOption?: (option: ComboOption<T>, state: OptionRenderState) => ReactNode;
  /** Custom content of the closed trigger for the selected option. */
  renderValue?: (option: ComboOption<T>) => ReactNode;
  /** Shows an × to clear the value. */
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  /** Title of the bottom sheet on phones (default: aria-label or placeholder). */
  title?: string;
  icon?: LucideIcon;
  size?: "md" | "lg";
  /** Max rendered options while searching (default 150). */
  limit?: number;
  className?: string;
}

/**
 * Searchable single select (cmdk). Vietnamese accent-insensitive search ("nguyen duc" finds "Nguyễn Đức"),
 * grouped options, rich rows. Popover on ≥640px, bottom sheet on phones.
 */
export function Combobox<T extends string>({
  options,
  value,
  onChange,
  placeholder = "Chọn…",
  searchPlaceholder = "Gõ để tìm…",
  emptyText = "Không tìm thấy kết quả phù hợp",
  renderOption,
  renderValue,
  clearable,
  disabled,
  invalid,
  id,
  "aria-label": ariaLabel,
  title,
  icon: Icon,
  size = "md",
  limit = 150,
  className,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isMobile = useIsMobile();
  const a11y = useFieldControl({ id, invalid });
  const selected = value != null ? options.find((o) => o.value === value) : undefined;

  const setOpenAndReset = (v: boolean) => {
    setOpen(v);
    if (!v) setQuery("");
  };
  const choose = (v: T) => {
    onChange(v);
    setOpenAndReset(false);
  };

  const trigger = (
    <button
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label={ariaLabel}
      disabled={disabled}
      {...a11y}
      onClick={isMobile ? () => setOpenAndReset(true) : undefined}
      className={cn(
        controlBase,
        controlHeight[size],
        "flex items-center gap-2 pl-3 text-left",
        clearable && selected ? "pr-16" : "pr-9",
        open && "border-brand-500 ring-4 ring-brand-500/15",
      )}
    >
      {Icon ? <Icon aria-hidden className="size-[18px] shrink-0 text-slate-400" strokeWidth={2} /> : null}
      <span className={cn("min-w-0 flex-1 truncate", !selected && "text-slate-400")}>
        {selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}
      </span>
    </button>
  );

  const list = (
    <OptionList
      options={options}
      query={query}
      onQueryChange={setQuery}
      isSelected={(v) => v === value}
      onSelect={choose}
      renderOption={renderOption}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      limit={limit}
      label={ariaLabel ?? title ?? placeholder}
      autoFocus={!isMobile || options.length > 12}
      listClassName={isMobile ? "max-h-[60dvh]" : "max-h-[min(340px,var(--radix-popover-content-available-height,340px))]"}
    />
  );

  const adornments = (
    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 pr-2">
      {clearable && selected && !disabled ? (
        <button
          type="button"
          aria-label="Bỏ chọn"
          onClick={() => onChange(undefined)}
          className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-900/5 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:size-9"
        >
          <X aria-hidden className="size-4" strokeWidth={2.5} />
        </button>
      ) : null}
      <ChevronsUpDown aria-hidden className="size-4 text-slate-400" strokeWidth={2.25} />
    </span>
  );

  if (isMobile) {
    return (
      <div className={cn("relative min-w-0", className)}>
        {trigger}
        {adornments}
        <Sheet open={open} onOpenChange={setOpenAndReset} side="bottom" title={title ?? ariaLabel ?? placeholder} bodyClassName="p-0 sm:p-0">
          {list}
        </Sheet>
      </div>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpenAndReset}>
      <div className={cn("relative min-w-0", className)}>
        <Popover.Trigger asChild>{trigger}</Popover.Trigger>
        {adornments}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] w-[var(--radix-popover-trigger-width)] min-w-[260px] max-w-[min(480px,calc(100vw-24px))] overflow-hidden rounded-xl border border-border bg-surface shadow-pop outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-scale-in"
        >
          {list}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
