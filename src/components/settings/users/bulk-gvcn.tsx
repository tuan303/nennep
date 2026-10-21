"use client";
import { useState } from "react";
import { ClipboardCopy, FileSpreadsheet, Link2, SkipForward, UserPlus, UsersRound } from "lucide-react";
import { Badge, Button, Card, Checkbox, ConfirmDialog, DataTable, Dialog, KpiCard, toast } from "@/components/ui";
import { copyWithFallback } from "@/components/app/widgets";
import { MIME, api, downloadBlob, errorMessage } from "@/lib/client/api";
import { useToday } from "@/lib/client/hooks";
import { fmtDate } from "@/lib/client/format";
import { LEVELS } from "@/lib/constants";
import type { BulkGvcnResult } from "@/lib/contract";
import type { ClassInfo, LevelId } from "@/lib/types";
import { gvcnEmailCoverage } from "../lib/classes-edit";
import { bulkCreatedRows, bulkCreatedText, bulkResultCounts } from "../lib/users";
import { Notice } from "../shared/notice";
import { useSettingsNav } from "../shared/settings-context";

export interface BulkGvcnProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  levelId: LevelId;
  /** Classes of the level (undefined while loading) – used to preview the email coverage. */
  classes?: readonly ClassInfo[];
  onDone: () => void;
}

/** "Tạo tài khoản GVCN hàng loạt": confirmation (with email coverage), then the one-time results. */
export function BulkGvcn({ open, onOpenChange, levelId, classes, onDone }: BulkGvcnProps) {
  const { goToTab } = useSettingsNav();
  const [result, setResult] = useState<BulkGvcnResult | null>(null);
  /** "Đồng bộ": also remove this level's class assignments that no longer match the class list (new school year). */
  const [sync, setSync] = useState(false);
  const coverage = classes ? gvcnEmailCoverage(classes) : undefined;
  const level = LEVELS[levelId];

  async function run() {
    try {
      const res = await api.users.bulkGvcn({ levelId, sync });
      setResult(res);
      const c = bulkResultCounts(res);
      toast.success("Đã xử lý tài khoản GVCN", {
        description: `${c.created} tạo mới / cấp mật khẩu · ${c.linked} gán lớp cho tài khoản có sẵn · ${c.skipped} bỏ qua${sync ? ` · ${c.unassigned} lớp được gỡ` : ""}`,
      });
      onDone();
    } catch (err) {
      toast.error("Chưa tạo được tài khoản GVCN", { description: errorMessage(err) });
      throw err;
    }
  }

  return (
    <>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setSync(false);
          onOpenChange(o);
        }}
        title={`Tạo tài khoản GVCN hàng loạt – ${level.name}`}
        message="Hệ thống dùng email GVCN trong mục Lớp & GVCN của cấp này: tạo tài khoản GVCN cho email chưa có tài khoản (mật khẩu tạm hiển thị một lần), gán thêm lớp cho tài khoản đã có (không đổi vai trò) và bỏ qua lớp chưa có email hoặc email sai. Email đã có tài khoản đăng nhập nhưng chưa được cấp quyền sẽ được cấp mật khẩu tạm mới (tài khoản cũ bị đăng xuất)."
        confirmLabel="Tạo tài khoản"
        onConfirm={run}
        confirmDisabled={coverage ? coverage.withEmail === 0 : false}
      >
        <div className="rounded-control px-3 py-2.5 ring-1 ring-inset ring-border">
          <Checkbox
            checked={sync}
            onChange={setSync}
            label={<span className="font-semibold text-slate-800">Đồng bộ (gỡ lớp cũ)</span>}
            description={`Gỡ các lớp ${level.short} khỏi tài khoản không còn là GVCN của lớp đó theo danh mục hiện tại (ví dụ khi đổi GVCN đầu năm học) – họ không còn xem chi tiết học sinh của lớp cũ.`}
          />
        </div>
        {coverage ? (
          <Notice
            tone={coverage.withEmail === coverage.active ? "ok" : "warn"}
            action={
              coverage.withEmail < coverage.active ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onOpenChange(false);
                    goToTab("lop");
                  }}
                >
                  Bổ sung email
                </Button>
              ) : undefined
            }
          >
            <span className="num">
              {coverage.withEmail}/{coverage.active} lớp đang hoạt động có email GVCN hợp lệ
              {coverage.invalid ? ` · ${coverage.invalid} email sai` : ""}.
            </span>
          </Notice>
        ) : null}
      </ConfirmDialog>
      <BulkResultDialog result={result} levelId={levelId} onClose={() => setResult(null)} />
    </>
  );
}

function BulkResultDialog({ result, levelId, onClose }: { result: BulkGvcnResult | null; levelId: LevelId; onClose: () => void }) {
  const today = useToday();
  const [exporting, setExporting] = useState(false);
  const level = LEVELS[levelId];
  const counts = result ? bulkResultCounts(result) : { created: 0, linked: 0, skipped: 0, unassigned: 0 };

  async function copyAll() {
    if (!result) return;
    await copyWithFallback(bulkCreatedText(result, level.name), {
      success: `Đã sao chép ${counts.created} tài khoản`,
      successDescription: "Dán vào Excel/Google Sheets để lưu và phân phát.",
      title: "Sao chép danh sách tài khoản GVCN",
      failure: "Không sao chép được. Hãy dùng “Xuất Excel”.",
    });
  }

  async function exportExcel() {
    if (!result) return;
    setExporting(true);
    try {
      const { exportSimpleSheet } = await import("@/lib/excel");
      const bytes = await exportSimpleSheet(
        `Tài khoản GVCN mới – ${level.name}`,
        [
          { header: "Lớp", key: "classCode", width: 16 },
          { header: "Họ tên", key: "displayName", width: 32 },
          { header: "Email", key: "email", width: 36 },
          { header: "Mật khẩu tạm", key: "tempPassword", width: 20 },
        ],
        bulkCreatedRows(result),
        { subtitle: `Tạo ngày ${fmtDate(today)} · Mật khẩu tạm – yêu cầu đổi sau lần đăng nhập đầu tiên`, sheetName: "Tài khoản GVCN" },
      );
      downloadBlob(bytes, `Tai-khoan-GVCN-${levelId}-${today}.xlsx`, MIME.xlsx);
    } catch (err) {
      toast.error("Chưa xuất được file Excel", { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog
      open={result !== null}
      onOpenChange={(o) => !o && onClose()}
      dismissible={false}
      size="xl"
      icon={UsersRound}
      title={`Kết quả tạo tài khoản GVCN – ${level.name}`}
      footer={<Button onClick={onClose}>Tôi đã lưu mật khẩu, đóng</Button>}
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <KpiCard label="Tạo mới / cấp mật khẩu" value={counts.created} icon={UserPlus} tone="ok" />
            <KpiCard label="Gán lớp" value={counts.linked} icon={Link2} tone="brand" hint="Tài khoản có sẵn" />
            <KpiCard label="Bỏ qua" value={counts.skipped} icon={SkipForward} tone={counts.skipped ? "warn" : "muted"} />
          </div>
          {counts.created > 0 ? (
            <>
              <Notice
                tone="warn"
                title="Mật khẩu tạm chỉ hiển thị một lần"
                action={
                  <>
                    <Button size="sm" variant="secondary" icon={ClipboardCopy} onClick={() => void copyAll()}>
                      Sao chép tất cả
                    </Button>
                    <Button size="sm" variant="secondary" icon={FileSpreadsheet} loading={exporting} onClick={() => void exportExcel()}>
                      Xuất Excel
                    </Button>
                  </>
                }
              >
                Lưu danh sách trước khi đóng, chuyển riêng cho từng GVCN và nhắc đổi mật khẩu sau lần đăng nhập đầu. Danh sách gồm cả email đã có
                tài khoản đăng nhập nhưng chưa được cấp quyền: tài khoản đó được cấp mật khẩu tạm mới.
              </Notice>
              <Card padding="none" title="Tài khoản mới / được cấp mật khẩu tạm" headingLevel={4}>
                <DataTable
                  dense
                  rows={result.created}
                  rowKey={(r) => r.email}
                  caption="Tài khoản GVCN mới và mật khẩu tạm"
                  columns={[
                    { key: "class", header: "Lớp", width: 110, cell: (r) => <span className="num font-semibold">{r.classCode}</span> },
                    { key: "name", header: "Họ tên", cell: (r) => r.displayName },
                    { key: "email", header: "Email", cell: (r) => <span className="break-all">{r.email}</span> },
                    {
                      key: "pw",
                      header: "Mật khẩu tạm",
                      width: 170,
                      cell: (r) => <span className="select-all font-mono font-bold text-brand-900">{r.tempPassword}</span>,
                    },
                  ]}
                  mobileCard={(r) => (
                    <div className="flex flex-col gap-1">
                      <p className="flex items-center gap-2">
                        <span className="num font-bold text-brand-900">{r.classCode}</span>
                        <span className="truncate text-sm text-slate-700">{r.displayName}</span>
                      </p>
                      <p className="break-all text-[13px] text-slate-500">{r.email}</p>
                      <p className="select-all font-mono text-[15px] font-bold text-brand-900">{r.tempPassword}</p>
                    </div>
                  )}
                />
              </Card>
            </>
          ) : null}
          {result.linkedExisting.length > 0 ? (
            <ResultList title="Đã có tài khoản – được gán lớp" tone="brand" items={result.linkedExisting.map((l) => ({ code: l.classCode, text: l.email }))} />
          ) : null}
          {result.skipped.length > 0 ? (
            <ResultList title="Bỏ qua" tone="warn" items={result.skipped.map((s) => ({ code: s.classCode, text: s.reason }))} />
          ) : null}
          {result.unassigned && result.unassigned.length > 0 ? (
            <ResultList title="Đồng bộ – đã gỡ lớp khỏi tài khoản" tone="warn" items={result.unassigned.map((u) => ({ code: u.classCode, text: u.email }))} />
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function ResultList({ title, tone, items }: { title: string; tone: "brand" | "warn"; items: Array<{ code: string; text: string }> }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-brand-900">
        {title} <span className="num font-normal text-slate-500">({items.length})</span>
      </h4>
      <ul className="flex flex-col divide-y divide-border rounded-control ring-1 ring-inset ring-border">
        {items.map((i, idx) => (
          <li key={`${i.code}-${idx}`} className="flex items-start gap-3 px-3 py-2 text-[13px]">
            <Badge tone={tone} size="sm" className="mt-0.5">
              {i.code}
            </Badge>
            <span className="min-w-0 break-words text-slate-700">{i.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
