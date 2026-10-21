"use client";
import { User, Users } from "lucide-react";
import { StudentPicker } from "@/components/app/widgets";
import { Field, NumberStepper, SegmentedControl } from "@/components/ui";
import type { LevelDataset, Scope, StudentRef, Unit } from "@/lib/types";

const SCOPE_OPTIONS = [
  { value: "Cá nhân" as const, label: "Cá nhân", icon: User },
  { value: "Tập thể" as const, label: "Tập thể", icon: Users },
];

export interface ScopeFieldProps {
  value: Scope;
  onChange: (scope: Scope) => void;
  unit?: Unit;
  /** The scope still follows the error's default (not chosen by the user). */
  automatic: boolean;
}

/** Step 3 – "Cá nhân" / "Tập thể". */
export function ScopeField({ value, onChange, unit, automatic }: ScopeFieldProps) {
  const help =
    value === "Cá nhân"
      ? "Vi phạm của từng học sinh – bắt buộc chọn tên học sinh liên quan."
      : unit === "/HS"
        ? "Vi phạm của nhiều học sinh trong lớp – chọn tên hoặc nhập số học sinh chưa rõ tên."
        : "Vi phạm của tập thể lớp – không bắt buộc chọn học sinh.";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SegmentedControl<Scope> options={SCOPE_OPTIONS} value={value} onChange={onChange} ariaLabel="Phạm vi" fullWidth className="sm:max-w-sm" />
      <p className="text-xs leading-5 text-slate-500">
        {help}
        {automatic && unit ? <span className="text-slate-400"> Tự chọn theo đơn vị lỗi ({unit}).</span> : null}
      </p>
    </div>
  );
}

export interface StudentsFieldProps {
  ds: Pick<LevelDataset, "students" | "incidents">;
  classCode: string;
  scope: Scope;
  unit?: Unit;
  studentIds: string[];
  onStudentsChange: (ids: string[]) => void;
  /** Edit with an unchanged class: students already on the record (kept by the server even if they changed class). */
  keptStudents?: ReadonlyArray<Pick<StudentRef, "id" | "name">>;
  unnamedCount: number;
  onUnnamedChange: (n: number) => void;
  occurrenceCount: number;
  onOccurrenceChange: (n: number) => void;
  allowsUnnamed: boolean;
}

/** Step 4 – named students of the class (ACTIVE only), plus "Số HS chưa rõ tên" (/HS + Tập thể) or "Số lần vi phạm" (/lần). */
export function StudentsField(p: StudentsFieldProps) {
  const perOccurrence = p.unit === "/lần";
  const required = p.scope === "Cá nhân";
  let hint: string | undefined;
  if (!p.classCode) hint = undefined;
  else if (!p.unit) hint = "Chỉ hiện học sinh đang học của lớp đã chọn.";
  else if (perOccurrence)
    hint =
      p.scope === "Cá nhân"
        ? "Bắt buộc với phạm vi Cá nhân. Lỗi tính theo lần nên không cộng thêm điểm theo số học sinh."
        : "Không bắt buộc – chỉ để tham chiếu, không cộng thêm điểm.";
  else
    hint = p.allowsUnnamed
      ? "Chọn tên học sinh, hoặc nhập số HS chưa rõ tên ở bên dưới. Mỗi học sinh tính một lần mức trừ."
      : "Mỗi học sinh được chọn tính một lần mức trừ.";

  const students = (
    <Field label="Học sinh liên quan" required={required} hint={hint} labelAside={p.studentIds.length > 0 ? `${p.studentIds.length} đã chọn` : undefined}>
      <StudentPicker ds={p.ds} classCode={p.classCode} value={p.studentIds} keptStudents={p.keptStudents} onChange={p.onStudentsChange} />
    </Field>
  );

  return (
    <>
      {perOccurrence ? (
        <Field label="Số lần vi phạm" required hint="Điểm trừ = mức trừ × số lần (mặc định 1 lần cho mỗi sự việc).">
          <NumberStepper value={p.occurrenceCount} onChange={p.onOccurrenceChange} min={1} max={100} suffix="lần" size="lg" className="w-full sm:w-56" />
        </Field>
      ) : null}
      {students}
      {p.allowsUnnamed ? (
        <Field label="Số HS chưa rõ tên" hint="Dùng khi không xác định được tên – bản ghi sẽ được đánh dấu Thiếu tên HS để rà soát.">
          <NumberStepper value={p.unnamedCount} onChange={p.onUnnamedChange} min={0} max={80} suffix="HS" size="lg" className="w-full sm:w-56" />
        </Field>
      ) : null}
    </>
  );
}
