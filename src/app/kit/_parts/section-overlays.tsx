"use client";

import { useState } from "react";
import { CalendarClock, ClipboardList, FileSpreadsheet, History, Info, Layers, PanelRight, SearchX, Trash, UserRound } from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogClose,
  EmptyState,
  ErrorState,
  Field,
  KpiCard,
  Section,
  Sheet,
  Skeleton,
  SkeletonCard,
  Spinner,
  StatusBadge,
  Textarea,
  toast,
  Tooltip,
} from "@/components/ui";
import { BarChart } from "@/components/charts";

const HISTORY = [
  { date: "16/10/2026", weekday: "Thứ Sáu", issue: "Không đeo thẻ học sinh", points: 1, status: "Đã đóng" as const },
  { date: "14/10/2026", weekday: "Thứ Tư", issue: "Đi học muộn", points: 2, status: "Đang xử lý" as const },
  { date: "02/10/2026", weekday: "Thứ Sáu", issue: "Sử dụng điện thoại sai quy định", points: 5, status: "Mới ghi nhận" as const },
];

/** Dialogs, sheets, confirmations, tooltips, toasts and loading / empty / error states. */
export function SectionOverlays() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  return (
    <Section id="lop-phu" icon={Layers} title="Hộp thoại, thông báo và trạng thái" className="scroll-mt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Lớp phủ" subtitle="Bàn phím: Tab, Esc; khóa cuộn; trả focus khi đóng">
          <div className="flex flex-wrap gap-2.5">
            <Dialog
              trigger={<Button variant="secondary" icon={ClipboardList}>Mở hộp thoại</Button>}
              title="Phản hồi của GVCN"
              description="Lớp 6A03 · Đi học muộn · 14/10/2026"
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="secondary">Hủy</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button onClick={() => toast.success("Đã gửi phản hồi")}>Gửi phản hồi</Button>
                  </DialogClose>
                </>
              }
            >
              <Field label="Nội dung phản hồi" hint="Phụ huynh đã được thông báo qua Zalo.">
                <Textarea placeholder="VD: Em đã được nhắc nhở, gia đình cam kết đưa đón đúng giờ." />
              </Field>
            </Dialog>
            <Button variant="secondary" icon={PanelRight} onClick={() => setSheetOpen(true)}>
              Lịch sử học sinh
            </Button>
            <Sheet
              side="bottom"
              trigger={<Button variant="ghost" icon={CalendarClock}>Bảng dưới</Button>}
              title="Chọn kỳ báo cáo"
              description="Bảng trượt từ dưới lên – kéo thanh nắm để đóng"
            >
              <div className="grid gap-2">
                {["Tuần này", "Tuần trước", "Tháng 10/2026", "Học kỳ I"].map((p) => (
                  <Button key={p} variant="secondary" block onClick={() => toast(`Đã chọn: ${p}`)}>
                    {p}
                  </Button>
                ))}
              </div>
            </Sheet>
            <Button variant="danger" icon={Trash} onClick={() => setConfirmOpen(true)}>
              Xóa sự việc
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
            <span className="text-[13px] text-slate-500">Thông báo nhanh:</span>
            <Button size="sm" variant="secondary" onClick={() => toast.success("Đã lưu sự việc", { description: "NN-20261021-0042 · 6A03 · 4 điểm" })}>
              Thành công
            </Button>
            <Button size="sm" variant="secondary" onClick={() => toast.error("Không lưu được", { description: "Phạm vi Cá nhân phải chọn học sinh liên quan." })}>
              Lỗi
            </Button>
            <Button size="sm" variant="secondary" onClick={() => toast.warning("Ngưỡng RAG chưa được phê duyệt", { description: "Mọi lớp đang hiển thị màu Xám." })}>
              Cảnh báo
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                toast.promise(new Promise((r) => setTimeout(r, 1500)), {
                  loading: "Đang xuất tệp Excel…",
                  success: "Đã xuất NSHM_THCS.xlsx",
                  error: "Xuất tệp thất bại",
                })
              }
            >
              Đang xử lý
            </Button>
            <Tooltip content="Chạm (điện thoại) hoặc rê chuột để xem giải thích">
              <button type="button" aria-label="Giải thích" className="inline-flex size-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-900/5 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500">
                <Info className="size-[18px]" aria-hidden />
              </button>
            </Tooltip>
          </div>
        </Card>

        <Card title="Đang tải" subtitle="Khung giữ chỗ cùng kích thước – không xô lệch bố cục">
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiCard label="Sự việc" value={0} loading delta={{ value: 0, goodWhen: "down" }} />
            <div className="card flex items-center gap-3 p-4">
              <Skeleton round className="size-10" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-brand-600">
            <Spinner size="xs" />
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
            <span className="text-[13px] text-slate-500">Biểu đồ đang tải cũng giữ nguyên khung:</span>
          </div>
          <Card padding="none" className="mt-3 shadow-none">
            <DataTable
              loading
              loadingRows={3}
              rows={[]}
              rowKey={(r: { id: string }) => r.id}
              columns={[
                { key: "a", header: "Ngày", cell: () => null },
                { key: "b", header: "Lỗi", cell: () => null },
                { key: "c", header: "Điểm", align: "right", cell: () => null },
              ]}
            />
          </Card>
        </Card>

        <Card title="Trống" padding="sm">
          <EmptyState
            icon={SearchX}
            title="Không có sự việc phù hợp"
            description="Thử chọn kỳ khác hoặc bỏ bớt bộ lọc lớp, mảng."
            action={
              <Button variant="secondary" size="sm" onClick={() => toast("Đã xóa bộ lọc")}>
                Xóa bộ lọc
              </Button>
            }
          />
          <div className="border-t border-border">
            <BarChart categories={[]} series={[]} emptyDescription="Biểu đồ tự hiện trạng thái trống khi không có số liệu." />
          </div>
        </Card>

        <Card title="Lỗi" padding="sm">
          <ErrorState
            message="Máy chủ không phản hồi. Dữ liệu bạn đã nhập vẫn được giữ nguyên."
            retrying={retrying}
            onRetry={() => {
              setRetrying(true);
              setTimeout(() => setRetrying(false), 1200);
            }}
          />
          <SkeletonCard rows={2} className="shadow-none" />
        </Card>
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Nguyễn Minh An · 6A03"
        description="Mã HS 26151403 · 3 sự việc · 8 điểm trừ"
        icon={History}
        footer={
          <Button variant="secondary" icon={FileSpreadsheet} onClick={() => toast.success("Đã xuất lịch sử học sinh")}>
            Xuất Excel
          </Button>
        }
      >
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-surface-2 p-3 ring-1 ring-border">
          <Avatar name="Nguyễn Minh An" size="lg" />
          <div className="min-w-0 text-[13px] text-slate-600">
            <p className="flex items-center gap-1.5 font-semibold text-slate-900">
              <UserRound aria-hidden className="size-4 text-slate-400" /> Đang học · Lớp 6A03
            </p>
            <p>GVCN: Cô Hoàng Thị Mai</p>
          </div>
        </div>
        <ol className="relative ml-2 border-l-2 border-border pl-5">
          {HISTORY.map((h) => (
            <li key={h.date + h.issue} className="relative pb-5 last:pb-0">
              <span aria-hidden className="absolute -left-[27px] top-1 size-3 rounded-full bg-brand-600 ring-4 ring-brand-50" />
              <p className="num text-xs font-semibold text-slate-500">
                {h.weekday}, {h.date}
              </p>
              <p className="mt-0.5 font-medium text-slate-900">{h.issue}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="num rounded-md bg-bad-soft px-1.5 py-0.5 text-xs font-bold text-bad-strong">−{h.points} điểm</span>
                <StatusBadge status={h.status} size="sm" />
              </div>
            </li>
          ))}
        </ol>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="danger"
        title="Xóa sự việc NN-20261021-0042?"
        message="Sự việc sẽ bị ẩn khỏi mọi báo cáo và bảng xếp hạng. Quản trị viên có thể khôi phục trong mục Dữ liệu."
        confirmLabel="Xóa sự việc"
        requireText="XÓA"
        confirmDisabled={reason.trim().length < 3}
        onConfirm={async () => {
          await new Promise((r) => setTimeout(r, 900));
          setReason("");
          toast.success("Đã xóa sự việc", { description: "Có thể khôi phục trong mục Dữ liệu." });
        }}
      >
        <Field label="Lý do xóa" required hint="Tối thiểu 3 ký tự, được lưu vào nhật ký.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Nhập trùng với NN-20261021-0041" />
        </Field>
      </ConfirmDialog>
    </Section>
  );
}
