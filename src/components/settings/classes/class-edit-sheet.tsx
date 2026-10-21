"use client";
import { useEffect, useId, useState } from "react";
import { School } from "lucide-react";
import { Button, Field, Input, SegmentedControl, Sheet, Switch, Textarea } from "@/components/ui";
import { LEVELS } from "@/lib/constants";
import type { LevelId } from "@/lib/types";
import { codeTakenByOther, validateClassRow, type ClassField, type ClassRow } from "../lib/classes-edit";
import { codeKey } from "../lib/draft";
import { focusFirstInvalid } from "../shared/settings-context";

export interface ClassEditSheetProps {
  /** Row being edited (a new row for "Thêm lớp"); null closes the sheet. */
  row: ClassRow | null;
  rows: readonly ClassRow[];
  levelId: LevelId;
  onApply: (row: ClassRow) => void;
  onClose: () => void;
}

/** Edit one class in a sheet (bottom on phones). Changes go into the list; the list is saved with "Lưu thay đổi". */
export function ClassEditSheet({ row, rows, levelId, onApply, onClose }: ClassEditSheetProps) {
  const formId = useId();
  const adding = !!row && !rows.some((r) => r.key === row.key);
  /** The form differs from the row it opened with: swipe / overlay tap / Esc must not drop it (× and Hủy still close). */
  const [changed, setChanged] = useState(false);
  return (
    <Sheet
      open={row !== null}
      onOpenChange={(o) => !o && onClose()}
      dismissible={!changed}
      icon={School}
      title={adding ? "Thêm lớp" : `Sửa lớp ${row?.code ?? ""}`}
      description="Thay đổi được ghi vào danh sách; bấm “Lưu thay đổi” để lưu lên hệ thống."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form={formId}>
            {adding ? "Thêm vào danh sách" : "Cập nhật vào danh sách"}
          </Button>
        </>
      }
    >
      {row ? <ClassForm key={row.key} id={formId} initial={row} rows={rows} levelId={levelId} onApply={onApply} onChangedChange={setChanged} /> : null}
    </Sheet>
  );
}

function ClassForm({
  id,
  initial,
  rows,
  levelId,
  onApply,
  onChangedChange,
}: {
  id: string;
  initial: ClassRow;
  rows: readonly ClassRow[];
  levelId: LevelId;
  onApply: (r: ClassRow) => void;
  onChangedChange: (changed: boolean) => void;
}) {
  const [r, setR] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const changed = (Object.keys(initial) as Array<keyof ClassRow>).some((k) => r[k] !== initial[k]);
  useEffect(() => {
    onChangedChange(changed);
  }, [changed, onChangedChange]);
  useEffect(() => () => onChangedChange(false), [onChangedChange]);
  const set = (patch: Partial<ClassRow>) => setR((cur) => ({ ...cur, ...patch }));
  const dup = new Set(codeTakenByOther(rows, r) ? [codeKey(r.code)] : []);
  const errors = validateClassRow(r, levelId, dup);
  const show = (f: ClassField) => (submitted || r[f as keyof ClassRow] !== initial[f as keyof ClassRow] ? errors[f] : undefined);
  const grades = LEVELS[levelId].grades.map((g) => ({ value: String(g), label: `Khối ${g}` }));

  return (
    <form
      id={id}
      className="flex flex-col gap-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (Object.keys(errors).length === 0) {
          onApply({ ...r, code: r.code.trim(), homeroomEmail: r.homeroomEmail.trim() });
          return;
        }
        const form = e.currentTarget;
        window.setTimeout(() => focusFirstInvalid(form), 0);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mã lớp" required error={show("code")} hint={r.isNew ? undefined : "Mã lớp đã lưu không đổi được."}>
          <Input
            value={r.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            disabled={!r.isNew}
            maxLength={20}
            autoFocus={r.isNew}
            className="num font-semibold"
          />
        </Field>
        <Field label="Thứ tự hiển thị" required error={show("orderText")}>
          <Input value={r.orderText} onChange={(e) => set({ orderText: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" className="num" />
        </Field>
      </div>
      <Field label="Khối" required error={show("grade")}>
        <SegmentedControl options={grades} value={String(r.grade)} onChange={(v) => set({ grade: Number(v) })} ariaLabel="Khối" fullWidth />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hệ" error={show("system")}>
          <Input value={r.system} onChange={(e) => set({ system: e.target.value })} placeholder="VD: Song ngữ" />
        </Field>
        <Field label="Sĩ số" error={show("sourceSizeText")} hint="Theo danh sách nguồn">
          <Input value={r.sourceSizeText} onChange={(e) => set({ sourceSizeText: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" className="num" />
        </Field>
      </div>
      <Field label="GVCN" error={show("homeroomTeacher")} hint="Có thể ghi nhiều tên, VD: “Cô Nguyễn Thu Hà – Thầy John Smith (GV nước ngoài)”.">
        <Textarea value={r.homeroomTeacher} onChange={(e) => set({ homeroomTeacher: e.target.value })} rows={2} className="min-h-16" />
      </Field>
      <Field label="Phó chủ nhiệm" error={show("deputyTeacher")}>
        <Input value={r.deputyTeacher} onChange={(e) => set({ deputyTeacher: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SĐT GVCN" error={show("homeroomPhone")}>
          <Input
            type="tel"
            value={r.homeroomPhone}
            onChange={(e) => set({ homeroomPhone: e.target.value })}
            inputMode="tel"
            autoComplete="off"
            className="num"
          />
        </Field>
        <Field label="Email GVCN" error={show("homeroomEmail")} hint="Dùng để tạo tài khoản GVCN hàng loạt.">
          <Input
            type="email"
            value={r.homeroomEmail}
            onChange={(e) => set({ homeroomEmail: e.target.value })}
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </div>
      <Switch
        checked={r.active}
        onChange={(v) => set({ active: v })}
        label="Lớp đang hoạt động"
        description="Tắt khi lớp không còn học: lớp ẩn khỏi danh sách chọn và bảng xếp hạng, dữ liệu cũ giữ nguyên."
      />
    </form>
  );
}
