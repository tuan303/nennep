"use client";

import { useState, type ReactNode } from "react";
import { Bell, Download, MousePointerClick, Pencil, Plus, Save, Settings2, Shapes, Trash } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataCheckBadge,
  IconButton,
  Pill,
  PriorityBadge,
  ProgressBar,
  RagBadge,
  Section,
  StatusBadge,
  StatTrend,
  TONES,
  Top90Badge,
  Tooltip,
} from "@/components/ui";
import { TEACHERS } from "./demo-data";

const TONE_LABEL = { brand: "Thương hiệu", star: "Ngôi sao", ok: "Tốt", warn: "Chú ý", bad: "Nghiêm trọng", muted: "Trung tính" } as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0 md:flex-row md:items-start md:gap-6">
      <p className="w-40 shrink-0 pt-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}

/** Buttons, badges, status chips, avatars, meters. */
export function SectionBasics() {
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<string[]>(["Khối 6", "Đi học muộn"]);
  const [mode, setMode] = useState<"week" | "month">("week");

  return (
    <Section id="nut-nhan" icon={Shapes} title="Nút, nhãn và trạng thái" description="Mọi trạng thái đều có biểu tượng + chữ + màu – không dựa vào màu sắc đơn thuần." className="scroll-mt-6">
      <Card>
        <Row label="Nút">
          <Button icon={Save}>Lưu</Button>
          <Button variant="gold" icon={Plus}>
            Nhập sự việc
          </Button>
          <Button variant="secondary" icon={Download}>
            Xuất Excel
          </Button>
          <Button variant="outline">Xem chi tiết</Button>
          <Button variant="ghost" icon={Pencil}>
            Sửa
          </Button>
          <Button variant="danger" icon={Trash}>
            Xóa
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              setBusy(true);
              setTimeout(() => setBusy(false), 1600);
            }}
          >
            Bấm để tải
          </Button>
          <Button disabled>Không khả dụng</Button>
        </Row>
        <Row label="Kích cỡ">
          <Button size="sm">Nhỏ</Button>
          <Button size="md">Vừa</Button>
          <Button size="lg">Lớn</Button>
          <IconButton icon={Settings2} label="Cài đặt" variant="secondary" size="sm" />
          <IconButton icon={Bell} label="Thông báo (có mục mới)" badge />
          <Tooltip content="Nút chỉ có biểu tượng luôn có nhãn cho trình đọc màn hình">
            <IconButton icon={MousePointerClick} label="Ví dụ nút biểu tượng" variant="outline" size="lg" />
          </Tooltip>
        </Row>
        <Row label="Nhãn theo tông">
          {TONES.map((t) => (
            <Badge key={t} tone={t} dot>
              {TONE_LABEL[t]}
            </Badge>
          ))}
        </Row>
        <Row label="Đặc / viền">
          {TONES.map((t) => (
            <Badge key={t} tone={t} variant="solid" size="sm">
              {TONE_LABEL[t]}
            </Badge>
          ))}
          {TONES.slice(0, 3).map((t) => (
            <Badge key={`o-${t}`} tone={t} variant="outline" size="sm">
              {TONE_LABEL[t]}
            </Badge>
          ))}
        </Row>
        <Row label="RAG">
          <RagBadge rag="GREEN" reason="TB 4,2 điểm trừ/tuần, dưới ngưỡng vàng 10" />
          <RagBadge rag="YELLOW" reason="TB 13,5 điểm trừ/tuần ≥ ngưỡng vàng 10" />
          <RagBadge rag="RED" reason="TB 27,6 điểm trừ/tuần ≥ ngưỡng đỏ 25" />
          <RagBadge rag="GRAY" reason="Ngưỡng chưa được phê duyệt" />
          <RagBadge rag="YELLOW" compact size="sm" />
        </Row>
        <Row label="Top 90% · dữ liệu">
          <Top90Badge inTop90 hint="Hạng 3/12 · ngưỡng Top 90%: hạng 11" />
          <Top90Badge inTop90={false} />
          <DataCheckBadge dataCheck="OK" />
          <DataCheckBadge dataCheck="THIEU_TEN_HS" issues={[{ code: "UNNAMED_STUDENTS", message: "2 học sinh chưa rõ tên." }]} />
          <DataCheckBadge dataCheck="REVIEW" issues={[{ code: "STUDENT_WRONG_CLASS", message: "Nguyễn Văn An (6A02) không thuộc lớp 6A03." }]} />
        </Row>
        <Row label="Quy trình">
          <StatusBadge status="Mới ghi nhận" />
          <StatusBadge status="Đang xử lý" />
          <StatusBadge status="Đã đóng" />
          <StatusBadge status="Đang xác minh" />
          <StatusBadge status="Đã xác nhận" />
          <StatusBadge status="Open" />
          <StatusBadge status="Doing" />
          <StatusBadge status="Done" />
          <PriorityBadge priority="High" />
          <PriorityBadge priority="Medium" />
          <PriorityBadge priority="Low" />
        </Row>
        <Row label="Biến động">
          <StatTrend value={12} goodWhen="down" label="sự việc so với tuần trước" />
          <StatTrend value={-7} goodWhen="down" label="điểm trừ" />
          <StatTrend value={15} goodWhen="up" label="điểm thưởng" />
          <StatTrend value={0} goodWhen="up" label="không đổi" />
        </Row>
        <Row label="Chip lọc">
          {filters.map((f) => (
            <Pill key={f} onRemove={() => setFilters((xs) => xs.filter((x) => x !== f))}>
              {f}
            </Pill>
          ))}
          <Pill active={mode === "week"} onClick={() => setMode("week")}>
            Theo tuần
          </Pill>
          <Pill active={mode === "month"} onClick={() => setMode("month")}>
            Theo tháng
          </Pill>
          {filters.length < 2 ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters(["Khối 6", "Đi học muộn"])}>
              Khôi phục
            </Button>
          ) : null}
        </Row>
        <Row label="Ảnh đại diện">
          <div className="flex -space-x-2">
            {TEACHERS.slice(0, 5).map((t) => (
              <Avatar key={t} name={t} size="md" />
            ))}
          </div>
          <Avatar name="Hoàng Thị Mai" size="lg" />
          <Avatar name="Đặng Thùy Linh" size="sm" />
          <Avatar name="Ngô Đức Anh" size="xs" />
        </Row>
        <Row label="Thanh tiến độ">
          <div className="grid w-full gap-4 sm:grid-cols-3">
            <ProgressBar value={0.964} tone="ok" label="Độ tin cậy dữ liệu" showValue />
            <ProgressBar value={38 / 48} tone="warn" label="Lớp phát sinh" showValue valueText="38/48 lớp" />
            <ProgressBar value={0.42} tone="brand" label="Hành động hoàn thành" showValue size="sm" />
          </div>
        </Row>
      </Card>
    </Section>
  );
}
