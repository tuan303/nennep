"use client";

import { useMemo, useState } from "react";
import { ClipboardPen, Hash, School, Sparkles } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Combobox,
  DateInput,
  Field,
  Input,
  MultiCombobox,
  NumberStepper,
  SearchInput,
  Section,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
  toast,
  type ComboOption,
} from "@/components/ui";
import { computePoints, normalizeCounts } from "@/lib/engine/scoring";
import { formatDateVN } from "@/lib/engine/dates";
import type { IncidentStatus, Scope } from "@/lib/types";
import { CATALOG, CLASSES, STUDENTS } from "./demo-data";

const CLASS_OPTIONS: ComboOption[] = CLASSES.map((c) => ({ value: c.code, label: c.code, group: `Khối ${c.grade}`, description: `GVCN: ${c.teacher}`, keywords: [c.teacher] }));
const ERROR_OPTIONS: ComboOption[] = CATALOG.map((e) => ({ value: e.code, label: e.issue, group: e.category, keywords: [e.code] }));
const STUDENT_OPTIONS: ComboOption[] = STUDENTS.map((s) => ({ value: s.id, label: s.name, keywords: [s.id], description: `${s.id} · ${formatDateVN(s.dob)}` }));
const STATUS_OPTIONS: Array<{ value: IncidentStatus; label: string }> = [
  { value: "Mới ghi nhận", label: "Mới ghi nhận" },
  { value: "Đang xử lý", label: "Đang xử lý" },
  { value: "Đã đóng", label: "Đã đóng" },
];

/** A realistic "Nhập liệu" form wired to the scoring engine for the live points preview. */
export function SectionForms() {
  const [date, setDate] = useState("2026-10-21");
  const [classCode, setClassCode] = useState<string | undefined>("6A03");
  const [errorCode, setErrorCode] = useState<string | undefined>("L01");
  const [scope, setScope] = useState<Scope>("Cá nhân");
  const [studentIds, setStudentIds] = useState<string[]>([STUDENTS[0].id, STUDENTS[5].id]);
  const [unnamed, setUnnamed] = useState(0);
  const [occurrences, setOccurrences] = useState(1);
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<IncidentStatus | undefined>("Mới ghi nhận");
  const [notifyGvcn, setNotifyGvcn] = useState(true);
  const [keepClass, setKeepClass] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const item = CATALOG.find((c) => c.code === errorCode);
  const counts = item ? normalizeCounts(item.unit, scope, occurrences, unnamed) : { occurrenceCount: 1, unnamedCount: 0 };
  const points = item
    ? computePoints({ unit: item.unit, penalty: item.penalty, namedCount: studentIds.length, unnamedCount: counts.unnamedCount, occurrenceCount: counts.occurrenceCount })
    : 0;
  const studentError = scope === "Cá nhân" && studentIds.length === 0 ? "Phạm vi Cá nhân phải chọn học sinh liên quan." : undefined;
  const filteredHint = useMemo(() => (search ? `Đang lọc danh sách gần đây theo “${search}”` : "Gõ tên, mã HS hoặc lớp – không cần dấu"), [search]);

  async function save(next: boolean) {
    if (studentError) {
      toast.error("Chưa lưu được", { description: studentError });
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 900));
    setSaving(false);
    toast.success("Đã lưu sự việc NN-20261021-0042", { description: `${item?.issue ?? ""} · lớp ${classCode} · ${points} điểm trừ` });
    if (next) {
      setStudentIds([]);
      setDetail("");
      if (!keepClass) setClassCode(undefined);
    }
  }

  return (
    <Section id="bieu-mau" icon={ClipboardPen} title="Biểu mẫu" description="Một cột trên điện thoại, chữ 16px để không bị phóng to, vùng chạm ≥ 44px, tìm kiếm không dấu." className="scroll-mt-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Ghi nhận sự việc" subtitle="Biểu mẫu mẫu – dữ liệu minh họa">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <Field label="Ngày" required hint="Không chọn được ngày trong tương lai.">
              <DateInput value={date} onChange={setDate} max="2026-10-21" />
            </Field>
            <Field label="Lớp" required>
              <Combobox options={CLASS_OPTIONS} value={classCode} onChange={setClassCode} placeholder="Chọn lớp" title="Chọn lớp" icon={School} />
            </Field>
            <Field label="Lỗi vi phạm" required className="sm:col-span-2" labelAside={item ? `${item.code} · ${item.penalty} điểm${item.unit}` : undefined}>
              <Combobox
                options={ERROR_OPTIONS}
                value={errorCode}
                onChange={setErrorCode}
                placeholder="Chọn lỗi"
                title="Chọn lỗi vi phạm"
                searchPlaceholder="Gõ tên lỗi hoặc mã (L01)…"
                renderOption={(o) => {
                  const c = CATALOG.find((x) => x.code === o.value);
                  return (
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate">{o.label}</span>
                      <Badge tone={c && c.penalty >= 5 ? "bad" : "warn"} size="sm" variant="outline">
                        {c?.penalty} điểm{c?.unit}
                      </Badge>
                    </div>
                  );
                }}
              />
            </Field>
            <Field label="Phạm vi" className="sm:col-span-2">
              <SegmentedControl
                options={[
                  { value: "Cá nhân", label: "Cá nhân" },
                  { value: "Tập thể", label: "Tập thể" },
                ]}
                value={scope}
                onChange={setScope}
                ariaLabel="Phạm vi"
                fullWidth
              />
            </Field>
            <Field label="Học sinh liên quan" required={scope === "Cá nhân"} error={studentError} className="sm:col-span-2" labelAside={`${studentIds.length} đã chọn`}>
              <MultiCombobox
                options={STUDENT_OPTIONS}
                value={studentIds}
                onChange={setStudentIds}
                placeholder="Chọn học sinh lớp 6A03"
                title="Học sinh lớp 6A03"
                searchPlaceholder="Gõ tên hoặc mã HS…"
                selectAllVisible
                renderOption={(o) => (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={o.label} size="xs" />
                    <div className="min-w-0">
                      <div className="truncate">{o.label}</div>
                      <div className="num truncate text-xs text-slate-500">{o.description}</div>
                    </div>
                  </div>
                )}
              />
            </Field>
            {item?.unit === "/HS" ? (
              <Field label="Số HS chưa rõ tên" hint={scope === "Tập thể" ? "Được tính điểm, gắn cờ Thiếu tên HS." : "Chỉ dùng cho phạm vi Tập thể."}>
                <NumberStepper value={unnamed} onChange={setUnnamed} min={0} max={45} suffix="HS" disabled={scope !== "Tập thể"} />
              </Field>
            ) : (
              <Field label="Số lần vi phạm">
                <NumberStepper value={occurrences} onChange={setOccurrences} min={1} max={20} suffix="lần" />
              </Field>
            )}
            <Field label="Trạng thái">
              <Select options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            </Field>
            <Field label="Chi tiết" className="sm:col-span-2" hint="Không ghi thông tin nhạy cảm của học sinh." labelAside={`${detail.length}/500`}>
              <Textarea value={detail} onChange={(e) => setDetail(e.target.value.slice(0, 500))} placeholder="Mô tả ngắn gọn sự việc…" />
            </Field>
            <Field label="Mã tham chiếu" error="Mã đã tồn tại trong cấp học này.">
              <Input icon={Hash} defaultValue="NN-20261021-0007" suffix="THCS" />
            </Field>
            <Field label="Người ghi">
              <Input defaultValue="Cô Đặng Thùy Linh" disabled />
            </Field>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Switch checked={notifyGvcn} onChange={setNotifyGvcn} label="Báo cho GVCN" description="GVCN thấy sự việc trong mục Báo GVCN và có thể phản hồi." />
              <Checkbox checked={keepClass} onChange={setKeepClass} label="Giữ lớp khi “Lưu & nhập tiếp”" />
              <Checkbox checked="indeterminate" onChange={() => toast("Trạng thái chọn một phần")} label="Chọn một phần (minh họa)" />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => void save(true)} disabled={saving}>
                Lưu & nhập tiếp
              </Button>
              <Button type="submit" loading={saving}>
                Lưu sự việc
              </Button>
            </div>
          </form>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden border-white/20">
            <div className="relative -m-4 mb-0 overflow-hidden bg-gradient-to-br from-brand-900 to-brand-800 p-4 text-white sm:-m-5 sm:mb-0 sm:p-5">
              <div aria-hidden className="bg-stars absolute inset-0" />
              <div className="relative">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/70">
                  <Sparkles aria-hidden className="size-3.5 text-star-400" /> Điểm trừ dự kiến
                </p>
                <p className="num mt-1 text-5xl font-extrabold tracking-tight" aria-live="polite">
                  {points}
                  <span className="ml-1.5 text-lg font-semibold text-white/70">điểm</span>
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-slate-500">Lỗi</dt>
              <dd className="truncate text-right font-medium text-slate-800">{item?.issue ?? "–"}</dd>
              <dt className="text-slate-500">Cách tính</dt>
              <dd className="num text-right font-medium text-slate-800">
                {item ? (item.unit === "/HS" ? `${item.penalty} × ${studentIds.length + counts.unnamedCount} HS` : `${item.penalty} × ${counts.occurrenceCount} lần`) : "–"}
              </dd>
              <dt className="text-slate-500">Ngày</dt>
              <dd className="num text-right font-medium text-slate-800">{formatDateVN(date) || "–"}</dd>
            </dl>
          </Card>
          <Card title="Tìm kiếm" subtitle="Có độ trễ 250ms, Esc để xóa">
            <Field label="Tìm sự việc gần đây" hint={filteredHint}>
              <SearchInput value={search} onChange={setSearch} placeholder="VD: nguyen duc, 6a03, L01…" />
            </Field>
          </Card>
        </div>
      </div>
    </Section>
  );
}
