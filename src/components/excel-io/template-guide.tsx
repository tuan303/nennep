import { BookOpen, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui";
import { Notice } from "@/components/data-inspect/notice";
import { TEMPLATE_SHEETS } from "./lib/template-spec";

/** "Mẫu file": the sheets and columns the importer reads, with the tip to start from an export. */
export function TemplateGuide({ canExport }: { canExport: boolean }) {
  return (
    <Card title="Mẫu file Excel" subtitle="Các trang và cột hệ thống đọc khi nhập. Tên trang cần giữ nguyên; thứ tự cột có thể khác." icon={BookOpen}>
      <div className="flex flex-col gap-4">
        <Notice tone="star" icon={Lightbulb} title="Mẹo: bắt đầu từ file xuất của hệ thống">
          {canExport
            ? "Bấm “Xuất Excel” ở trên, chỉnh sửa trực tiếp trên file đó rồi nhập lại – cấu trúc luôn đúng và không tạo bản ghi trùng."
            : "Nhờ quản trị viên xuất workbook của cấp học, chỉnh sửa trên file đó rồi nhập lại – cấu trúc luôn đúng và không tạo bản ghi trùng."}{" "}
          Sổ nền nếp cũ của Tiểu học, THCS và THPT cũng được nhận diện tự động.
        </Notice>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {TEMPLATE_SHEETS.map((s) => (
            <li key={s.name} className="flex flex-col gap-2 rounded-control bg-surface-2 p-3.5 ring-1 ring-inset ring-border">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-bold text-brand-900">“{s.name}”</h4>
              </div>
              <p className="text-[13px] text-slate-600">{s.purpose}</p>
              <ul className="flex flex-wrap gap-1" aria-label={`Cột của trang ${s.name}`}>
                {s.columns.map((c) => (
                  <li key={c} className="rounded-md bg-surface px-1.5 py-0.5 text-2xs font-medium text-slate-700 ring-1 ring-inset ring-border">
                    {c}
                  </li>
                ))}
              </ul>
              {s.tip ? <p className="text-xs leading-relaxed text-slate-500">{s.tip}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
