"use client";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Check, History, Search, TriangleAlert, Users, X } from "lucide-react";
import { EmptyState, Input, Pill, cn } from "@/components/ui";
import { useToday } from "@/lib/client/hooks";
import type { LevelDataset, StudentLite, StudentRef } from "@/lib/types";
import { activeStudentsOfClass, frequentStudents, searchStudents, selectedStudents } from "./lib/student-options";

/** Contract limit of named students per incident. */
const CONTRACT_MAX = 80;

export interface StudentPickerProps {
  ds: Pick<LevelDataset, "students" | "incidents">;
  /** Students are limited to ACTIVE students currently in this class (FR-ENT-002). */
  classCode: string;
  /** Selected student ids (Mã HS). */
  value: string[];
  /**
   * Edit mode with the class unchanged: the students already on the record. They stay valid even if they left the
   * class since (the server keeps them), so they are shown as neutral chips instead of "bỏ chọn trước khi lưu".
   */
  keptStudents?: ReadonlyArray<Pick<StudentRef, "id" | "name">>;
  onChange: (ids: string[]) => void;
  /** Maximum number of students (default 80, the API limit). */
  max?: number;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** "Hay gặp gần đây": students of the class named most in the last 4 weeks (default true). */
  showFrequent?: boolean;
  className?: string;
}

/**
 * Class-scoped multi select for incident forms: selected chips with remove, a search box (name or Mã HS,
 * accent-insensitive) and a "Chọn nhanh" tap list of the class. Enter selects the only search match.
 */
export function StudentPicker({
  ds,
  classCode,
  value,
  keptStudents,
  onChange,
  max = CONTRACT_MAX,
  disabled,
  invalid,
  id,
  showFrequent = true,
  className,
}: StudentPickerProps) {
  const today = useToday();
  const [query, setQuery] = useState("");
  const listId = useId();
  const limit = Math.min(Math.max(1, max), CONTRACT_MAX);

  const roster = useMemo(() => activeStudentsOfClass(ds.students, classCode), [ds.students, classCode]);
  const rosterById = useMemo(() => new Map(roster.map((s) => [s.id, s] as const)), [roster]);
  const allById = useMemo(() => new Map(ds.students.map((s) => [s.id, s] as const)), [ds.students]);
  const frequent = useMemo(
    () => (showFrequent && roster.length > 0 ? frequentStudents(ds.incidents, roster, today) : []),
    [showFrequent, roster, ds.incidents, today],
  );
  const visible = useMemo(() => searchStudents(roster, query), [roster, query]);

  const selected = new Set(value);
  const full = value.length >= limit;

  const toggle = (sid: string) => {
    if (disabled) return;
    if (selected.has(sid)) onChange(value.filter((x) => x !== sid));
    else if (!full) onChange([...value, sid]);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (visible.length === 1) {
        toggle(visible[0].id);
        setQuery("");
      }
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    }
  };

  if (!classCode) {
    return (
      <div className={cn("rounded-card border border-dashed border-border-strong bg-surface-2", className)}>
        <EmptyState size="sm" icon={Users} tone="muted" title="Chọn lớp trước" description="Danh sách học sinh đang học của lớp sẽ hiện ở đây." />
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", disabled && "pointer-events-none opacity-60", className)} aria-disabled={disabled || undefined}>
      <SelectedChips
        chips={selectedStudents(value, rosterById, allById, keptStudents)}
        classCode={classCode}
        onRemove={toggle}
        onClear={() => onChange([])}
        limit={limit}
        disabled={disabled}
      />

      {roster.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong bg-surface-2">
          <EmptyState
            size="sm"
            icon={Users}
            tone="muted"
            title={`Lớp ${classCode} chưa có học sinh đang học`}
            description="Kiểm tra lại lớp đã chọn, hoặc nhờ Quản trị cập nhật danh sách học sinh."
          />
        </div>
      ) : (
        <>
          {frequent.length > 0 && !query ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-slate-500">Hay gặp gần đây</p>
              <div className="flex flex-wrap gap-1.5">
                {frequent.map(({ student, count }) => (
                  <Pill
                    key={student.id}
                    active={selected.has(student.id)}
                    onClick={() => toggle(student.id)}
                    disabled={disabled || (full && !selected.has(student.id))}
                    aria-label={`${student.name}, ${count} lượt trong 4 tuần`}
                  >
                    {student.name}
                  </Pill>
                ))}
              </div>
            </div>
          ) : null}

          <Input
            id={id}
            invalid={invalid}
            type="search"
            icon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Tìm theo tên hoặc mã HS…"
            aria-label="Tìm học sinh trong lớp"
            aria-controls={listId}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            disabled={disabled}
          />

          <div className="flex flex-col gap-1.5">
            <p className="flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-500">
              <span>
                Chọn nhanh · Lớp {classCode} ({roster.length} HS)
              </span>
              {full ? <span className="font-medium text-warn-strong">Đã đủ {limit} học sinh</span> : null}
            </p>
            <div
              id={listId}
              role="group"
              aria-label={`Học sinh lớp ${classCode}`}
              className="max-h-72 overflow-y-auto overscroll-contain rounded-card border border-border bg-surface-2 p-1.5"
            >
              {visible.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">Không có học sinh khớp “{query.trim()}”.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-1 min-[440px]:grid-cols-2">
                  {visible.map((s) => (
                    <li key={s.id}>
                      <StudentRow student={s} selected={selected.has(s.id)} disabled={disabled || (full && !selected.has(s.id))} onToggle={toggle} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StudentRow({ student, selected, disabled, onToggle }: { student: StudentLite; selected: boolean; disabled?: boolean; onToggle: (id: string) => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onToggle(student.id)}
      className={cn(
        "flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-45",
        selected ? "bg-brand-50 ring-1 ring-inset ring-brand-300" : "hover:bg-surface",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition-colors",
          selected ? "border-brand-600 bg-brand-600 text-white" : "border-border-strong bg-surface",
        )}
      >
        {selected ? <Check className="size-3.5" strokeWidth={3.5} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", selected ? "font-semibold text-brand-900" : "text-slate-800")}>{student.name}</span>
        <span className="num block text-2xs text-slate-500">{student.id}</span>
      </span>
    </button>
  );
}

interface SelectedChipsProps {
  chips: ReturnType<typeof selectedStudents>;
  classCode: string;
  onRemove: (id: string) => void;
  onClear: () => void;
  limit: number;
  disabled?: boolean;
}

/**
 * Selection summary: count, chips with ×, a neutral note for students kept from the edited record, and a warning for
 * ids that would really fail validation (no longer active in the class).
 */
function SelectedChips({ chips, classCode, onRemove, onClear, limit, disabled }: SelectedChipsProps) {
  const invalidCount = chips.filter((c) => c.state === "invalid").length;
  const keptCount = chips.filter((c) => c.state === "kept").length;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="num font-semibold text-slate-700">
          {chips.length === 0 ? "Chưa chọn học sinh nào" : `Đã chọn ${chips.length} học sinh`}
          {limit < CONTRACT_MAX ? <span className="font-normal text-slate-500"> / tối đa {limit}</span> : null}
        </span>
        {chips.length > 1 ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-900/5 hover:text-bad-strong focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <X aria-hidden className="size-3.5" strokeWidth={2.5} />
            Bỏ chọn tất cả
          </button>
        ) : null}
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <Pill
              key={c.id}
              tone={c.state === "invalid" ? "warn" : "brand"}
              icon={c.state === "invalid" ? TriangleAlert : c.state === "kept" ? History : undefined}
              className={c.state === "invalid" ? "bg-warn-soft text-warn-strong ring-warn/30" : c.state === "kept" ? "text-slate-600" : undefined}
              onRemove={() => onRemove(c.id)}
              removeLabel={`Bỏ ${c.name}`}
              disabled={disabled}
              title={
                c.state === "active"
                  ? `${c.name} · ${c.id}`
                  : c.state === "kept"
                    ? `${c.name} · ${c.id} · không còn học ở lớp ${classCode} – vẫn giữ trong bản ghi`
                    : `Không còn là học sinh đang học của lớp ${classCode}`
              }
            >
              {c.name}
            </Pill>
          ))}
        </div>
      ) : null}
      {keptCount > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          <History aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.25} />
          {keptCount} học sinh không còn học ở lớp {classCode} nhưng vẫn được giữ trong bản ghi này – không cần bỏ chọn.
        </p>
      ) : null}
      {invalidCount > 0 ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-warn-strong">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.25} />
          {invalidCount} học sinh không còn đang học ở lớp {classCode}. Vui lòng bỏ chọn trước khi lưu.
        </p>
      ) : null}
    </div>
  );
}
