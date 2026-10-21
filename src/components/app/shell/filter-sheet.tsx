"use client";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button, Field, Sheet } from "@/components/ui";
import { useLevel } from "@/lib/client/data";
import { useFilters } from "@/lib/client/filters";
import { LEVELS, PERIOD_MODE_LABELS } from "@/lib/constants";
import { CategoryField, ClassField, ErrorField, GradeField, GroupField, PeriodField, PeriodModeControl, StudentField } from "./filter-fields";
import { useFilterSheet } from "./shell-context";

/**
 * Filter panel for phones (bottom sheet) and tablets (right drawer). Changes apply immediately;
 * "Xem kết quả" just closes the sheet. Render inside <Suspense> (useFilters).
 */
export function FilterSheet() {
  const { open, setOpen } = useFilterSheet();
  const f = useFilters();
  const { levelId } = useLevel();
  const mode = f.filters.period.mode;

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Bộ lọc"
      description={`Áp dụng cho các báo cáo cấp ${LEVELS[levelId].name}.`}
      icon={SlidersHorizontal}
      size="sm"
      footer={
        <>
          <Button variant="secondary" icon={RotateCcw} onClick={f.resetFilters} disabled={f.activeCount === 0}>
            Xóa lọc
          </Button>
          <Button onClick={() => setOpen(false)}>Xem kết quả</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-[13.5px] font-semibold leading-5 text-slate-800">Kỳ báo cáo</p>
          <PeriodModeControl f={f} fullWidth />
          {mode !== "all" ? (
            <Field label={PERIOD_MODE_LABELS[mode]} className="mt-1">
              <PeriodField f={f} />
            </Field>
          ) : (
            <p className="text-[13px] text-slate-500">Hiển thị dữ liệu của toàn bộ năm học.</p>
          )}
        </div>
        <div className="h-px bg-border" aria-hidden />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
          <Field label="Khối">
            <GradeField f={f} />
          </Field>
          <Field label="Lớp">
            <ClassField f={f} />
          </Field>
          <Field label="Mảng">
            <CategoryField f={f} />
          </Field>
          <Field label="Nhóm lỗi">
            <GroupField f={f} />
          </Field>
          <Field label="Lỗi">
            <ErrorField f={f} />
          </Field>
          <Field label="Học sinh" hint="Mã HS hoặc họ tên; danh sách theo khối/lớp đang lọc.">
            <StudentField f={f} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
