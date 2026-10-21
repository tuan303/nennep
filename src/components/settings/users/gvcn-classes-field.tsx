"use client";
import { useState } from "react";
import { Button, Pill, SegmentedControl, Skeleton } from "@/components/ui";
import { ClassPicker } from "@/components/app/widgets";
import { useDataset } from "@/lib/client/data";
import { LEVELS } from "@/lib/constants";
import type { GvcnClassRef, LevelId } from "@/lib/types";
import { sortGvcnClasses } from "../lib/users";

export interface GvcnClassesFieldProps {
  value: GvcnClassRef[];
  onChange: (value: GvcnClassRef[]) => void;
  /** Levels the admin can pick classes from. */
  levels: readonly LevelId[];
  defaultLevel: LevelId;
  invalid?: boolean;
  disabled?: boolean;
}

/** Homeroom classes of a GVCN: chips of the selection + level switch and class picker to add more. */
export function GvcnClassesField({ value, onChange, levels, defaultLevel, invalid, disabled }: GvcnClassesFieldProps) {
  const [level, setLevel] = useState<LevelId>(levels.includes(defaultLevel) ? defaultLevel : (levels[0] ?? defaultLevel));
  const { dataset, status, error, refresh } = useDataset(level);
  const multiLevel = new Set(value.map((c) => c.levelId)).size > 1 || levels.length > 1;
  const chosenHere = value.filter((c) => c.levelId === level).map((c) => c.classCode);

  const add = (classCode: string) => {
    if (value.some((c) => c.levelId === level && c.classCode === classCode)) return;
    onChange(sortGvcnClasses([...value, { levelId: level, classCode }]));
  };
  const remove = (ref: GvcnClassRef) => onChange(value.filter((c) => !(c.levelId === ref.levelId && c.classCode === ref.classCode)));

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Lớp chủ nhiệm đã chọn">
          {value.map((c) => {
            const text = multiLevel ? `${c.classCode} · ${LEVELS[c.levelId].short}` : c.classCode;
            return (
              <li key={`${c.levelId}|${c.classCode}`}>
                <Pill onRemove={disabled ? undefined : () => remove(c)} removeLabel={`Bỏ lớp ${c.classCode}`}>
                  {text}
                </Pill>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={invalid ? "text-[13px] text-bad-strong" : "text-[13px] text-slate-500"}>Chưa chọn lớp chủ nhiệm.</p>
      )}
      <div className="flex flex-col gap-2 rounded-control bg-surface-2 p-3 ring-1 ring-inset ring-border">
        {levels.length > 1 ? (
          <SegmentedControl
            options={levels.map((l) => ({ value: l, label: LEVELS[l].short }))}
            value={level}
            onChange={setLevel}
            size="sm"
            fullWidth
            ariaLabel="Cấp học của lớp cần thêm"
          />
        ) : null}
        {dataset ? (
          <ClassPicker
            ds={dataset}
            onChange={add}
            disabledCodes={chosenHere}
            placeholder={`Thêm lớp ${LEVELS[level].short}…`}
            aria-label={`Thêm lớp chủ nhiệm cấp ${LEVELS[level].name}`}
            invalid={invalid}
            disabled={disabled}
          />
        ) : status === "error" ? (
          <div className="flex items-center justify-between gap-3 text-[13px] text-bad-strong">
            <span>{error ?? "Không tải được danh sách lớp."}</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()}>
              Thử lại
            </Button>
          </div>
        ) : (
          <Skeleton className="h-11 w-full" />
        )}
        <p className="text-xs text-slate-500">Chọn lần lượt từng lớp; một GVCN có thể chủ nhiệm nhiều lớp.</p>
      </div>
    </div>
  );
}
