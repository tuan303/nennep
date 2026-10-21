"use client";

import { forwardRef, type ForwardedRef, type ReactElement, type Ref, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { controlBase, controlHeight } from "./control-styles";
import { useFieldControl } from "./field";
import { groupOptions } from "./search";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Rendered as <optgroup>. */
  group?: string;
}

export interface SelectProps<T extends string = string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "size" | "defaultValue"> {
  options: ReadonlyArray<SelectOption<T>>;
  /** undefined = nothing selected (shows the placeholder). */
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  /** First option, e.g. "Tất cả khối". Selectable when `allowEmpty` (→ onChange(undefined)). */
  placeholder?: string;
  allowEmpty?: boolean;
  size?: "md" | "lg";
  invalid?: boolean;
  wrapperClassName?: string;
}

function SelectInner<T extends string>(
  { options, value, onChange, placeholder, allowEmpty, size = "md", invalid, className, wrapperClassName, ...rest }: SelectProps<T>,
  ref: ForwardedRef<HTMLSelectElement>,
) {
  const a11y = useFieldControl({ ...rest, invalid });
  const grouped = options.some((o) => o.group);
  const renderOption = (o: SelectOption<T>) => (
    <option key={o.value} value={o.value} disabled={o.disabled}>
      {o.label}
    </option>
  );
  return (
    <div className={cn("relative flex min-w-0 items-center", wrapperClassName)}>
      <select
        ref={ref}
        {...rest}
        {...a11y}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : (v as T));
        }}
        className={cn(controlBase, controlHeight[size], "cursor-pointer appearance-none truncate pl-3 pr-10", value === undefined && "text-slate-500", className)}
      >
        {placeholder != null || value === undefined ? (
          <option value="" disabled={!allowEmpty} hidden={!allowEmpty}>
            {placeholder ?? "Chọn…"}
          </option>
        ) : null}
        {grouped
          ? groupOptions(options).map((g) =>
              g.group ? (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(renderOption)}
                </optgroup>
              ) : (
                g.items.map(renderOption)
              ),
            )
          : options.map(renderOption)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-[18px] text-slate-500" strokeWidth={2} />
    </div>
  );
}

/** Native <select> styled like Input (best UX on phones). Generic over the option value type. */
export const Select = forwardRef(SelectInner) as <T extends string = string>(
  props: SelectProps<T> & { ref?: Ref<HTMLSelectElement> },
) => ReactElement;
