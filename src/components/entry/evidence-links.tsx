"use client";
import { useEffect, useRef, useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { Button, IconButton, Input } from "@/components/ui";
import { MAX_EVIDENCE_LINKS, linkError } from "./lib/links";

export interface EvidenceLinksProps {
  /** Link inputs as typed (validated by `checkEvidenceLinks` before saving). */
  value: string[];
  onChange: (links: string[]) => void;
  max?: number;
  disabled?: boolean;
}

/** Optional list of evidence links (Drive, Zalo album…): add / remove rows, each checked for http(s). */
export function EvidenceLinks({ value, onChange, max = MAX_EVIDENCE_LINKS, disabled }: EvidenceLinksProps) {
  const [focused, setFocused] = useState<number | null>(null);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const focusLast = useRef(false);

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    refs.current[value.length - 1]?.focus();
  }, [value.length]);

  const add = () => {
    focusLast.current = true;
    onChange([...value, ""]);
  };
  const update = (i: number, v: string) => onChange(value.map((x, k) => (k === i ? v : x)));
  const remove = (i: number) => onChange(value.filter((_, k) => k !== i));

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {value.map((link, i) => {
        const error = focused === i ? "" : linkError(link);
        return (
          <div key={i} className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <Input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="done"
                icon={Link2}
                value={link}
                maxLength={1000}
                placeholder="https://drive.google.com/…"
                aria-label={`Liên kết minh chứng ${i + 1}`}
                invalid={!!error}
                disabled={disabled}
                onFocus={() => setFocused(i)}
                onBlur={() => setFocused(null)}
                onChange={(e) => update(i, e.target.value)}
                wrapperClassName="min-w-0 flex-1"
              />
              <IconButton icon={X} label={`Bỏ liên kết ${i + 1}`} size="sm" onClick={() => remove(i)} disabled={disabled} />
            </div>
            {error ? <p className="text-xs font-medium text-bad-strong">{error}</p> : null}
          </div>
        );
      })}
      {value.length < max ? (
        <div>
          <Button variant="ghost" size="sm" icon={Plus} onClick={add} disabled={disabled} className="-ml-2 text-brand-700">
            {value.length === 0 ? "Thêm liên kết minh chứng" : "Thêm liên kết"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Đã đủ {max} liên kết.</p>
      )}
    </div>
  );
}
