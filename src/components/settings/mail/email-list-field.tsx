"use client";
import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { CircleAlert, TriangleAlert, X } from "lucide-react";
import { Field, cn, toast, toneSoft, useFieldControl } from "@/components/ui";
import { MAIL_MAX_RECIPIENTS } from "@/lib/constants";
import { parseEmailList } from "@/lib/mail/address";
import { addEmailEntries, isValidEmailEntry, removeEntry } from "./lib/mail-form";

export interface EmailListFieldProps {
  label: ReactNode;
  values: readonly string[];
  onChange: (values: string[]) => void;
  error?: string;
  /** Valid addresses outside the allowed domains: kept, but warned (emails to them are not sent). */
  blocked?: readonly string[];
  hint?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Address list editor: chips + a text box. Typing a comma / semicolon / Enter (or a space after a complete address),
 * pasting a whole list ("a@x.vn; Tên <b@x.vn>" or one address per line) or leaving the box adds the addresses.
 * Invalid entries stay as red chips (click a chip to edit it), addresses outside the allowed domains are amber.
 */
export function EmailListField({ label, values, onChange, error, blocked = [], hint, placeholder, disabled, className }: EmailListFieldProps) {
  const over = values.length > MAIL_MAX_RECIPIENTS;
  const warn =
    blocked.length > 0 ? (
      <span className="flex items-start gap-1.5 font-medium text-warn-strong">
        <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
        <span>
          Ngoài tên miền được phép – thư sẽ không gửi tới: <span className="break-all">{blocked.join(", ")}</span>.
        </span>
      </span>
    ) : null;
  return (
    <Field
      label={label}
      error={error}
      className={className}
      labelAside={
        <span className={cn("num", over && "font-semibold text-bad-strong")}>
          {values.length}/{MAIL_MAX_RECIPIENTS}
        </span>
      }
      hint={
        warn || hint ? (
          <span className="flex flex-col gap-1">
            {warn}
            {hint ? <span>{hint}</span> : null}
          </span>
        ) : undefined
      }
    >
      <EmailChipsInput values={values} onChange={onChange} blocked={blocked} placeholder={placeholder} disabled={disabled} invalid={!!error} />
    </Field>
  );
}

interface ChipsInputProps {
  values: readonly string[];
  onChange: (values: string[]) => void;
  blocked: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  invalid: boolean;
}

const SEPARATOR_END = /[,;\n]\s*$/;
const HAS_SEPARATOR = /[\s,;<]/;

function EmailChipsInput({ values, onChange, blocked, placeholder, disabled, invalid }: ChipsInputProps) {
  const a11y = useFieldControl({ invalid });
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const blockedSet = new Set(blocked);

  /** Adds every address of `raw` to the list; the box is emptied. */
  function commit(raw: string) {
    if (!raw.trim()) {
      setText("");
      return;
    }
    const res = addEmailEntries(values, raw);
    if (res.added > 0) onChange(res.list);
    else if (res.duplicates > 0) toast("Địa chỉ đã có trong danh sách");
    setText("");
  }

  function change(next: string) {
    // A separator, or a space after complete valid addresses, turns the text into chips.
    if (SEPARATOR_END.test(next) || (/\s$/.test(next) && next.trim() !== "" && !next.includes("<") && parseEmailList(next).invalid.length === 0)) commit(next);
    else setText(next);
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(text);
    } else if (e.key === "Backspace" && text === "" && values.length > 0) {
      // Brings the last chip back into the box to edit it (nothing is lost).
      e.preventDefault();
      const last = values[values.length - 1];
      onChange(values.slice(0, -1));
      setText(last);
    }
  }

  function paste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    const list = HAS_SEPARATOR.test(pasted.trim());
    // One piece pasted into a half-typed address ("gv" + "@example.edu.vn") is inserted normally.
    if (!list && (text !== "" || !pasted.includes("@"))) return;
    e.preventDefault();
    commit(list ? `${text} ${pasted}` : pasted);
  }

  function edit(entry: string) {
    if (disabled) return;
    // What is being typed becomes chips first; the chip clicked goes back into the box.
    const list = text.trim() ? addEmailEntries(values, text).list : values;
    onChange(removeEntry(list, entry));
    setText(entry);
    inputRef.current?.focus();
  }

  return (
    <div
      className={cn(
        "flex min-h-11 w-full min-w-0 flex-wrap items-center gap-1.5 rounded-control border border-border-strong bg-surface px-2 py-1.5 shadow-xs sm:min-h-10",
        "transition-[border-color,box-shadow] duration-150 ease-soft hover:border-slate-400 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15",
        invalid && "border-bad focus-within:border-bad focus-within:ring-bad/15",
        disabled && "cursor-not-allowed bg-surface-3 shadow-none",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      {values.length > 0 ? (
        <ul role="list" className="contents" aria-label={`${values.length} địa chỉ đã nhập`}>
          {values.map((v) => (
            <li key={v} className="max-w-full">
              <EmailChip value={v} state={!isValidEmailEntry(v) ? "invalid" : blockedSet.has(v) ? "blocked" : "ok"} disabled={disabled} onEdit={() => edit(v)} onRemove={() => onChange(removeEntry(values, v))} />
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={inputRef}
        type="text"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        {...a11y}
        value={text}
        disabled={disabled}
        placeholder={values.length === 0 ? placeholder : "Thêm địa chỉ…"}
        onChange={(e) => change(e.target.value)}
        onKeyDown={keyDown}
        onPaste={paste}
        onBlur={() => commit(text)}
        className="h-8 min-w-44 flex-1 bg-transparent px-1 text-base text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed sm:text-sm"
      />
    </div>
  );
}

type ChipState = "ok" | "invalid" | "blocked";

const CHIP_TONE: Record<ChipState, string> = {
  ok: "bg-brand-50 text-brand-800 ring-brand-200",
  invalid: toneSoft.bad,
  blocked: toneSoft.warn,
};

const CHIP_NOTE: Record<ChipState, string> = {
  ok: "",
  invalid: " (không hợp lệ)",
  blocked: " (ngoài tên miền được phép)",
};

function EmailChip({ value, state, disabled, onEdit, onRemove }: { value: string; state: ChipState; disabled?: boolean; onEdit: () => void; onRemove: () => void }) {
  const Icon = state === "invalid" ? CircleAlert : state === "blocked" ? TriangleAlert : null;
  return (
    <span className={cn("inline-flex h-8 max-w-full items-center gap-1 rounded-full pl-2.5 pr-1 text-[13px] font-medium ring-1 ring-inset", CHIP_TONE[state])}>
      {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} /> : null}
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        title="Bấm để sửa"
        className="min-w-0 truncate rounded-sm focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-default"
      >
        <span className="sr-only">Sửa </span>
        {value}
        {CHIP_NOTE[state] ? <span className="sr-only">{CHIP_NOTE[state]}</span> : null}
      </button>
      {disabled ? null : (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Bỏ ${value}`}
          className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-full opacity-70 transition before:absolute before:-inset-1.5 before:content-[''] hover:bg-slate-900/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <X aria-hidden className="size-3.5" strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}
