"use client";
/**
 * /nhat-ky – Nhật ký hệ thống (SCR-10, FR-AUD-001/002): read-only audit trail with filters, cursor pagination,
 * detail sheet (diff + JSON) and Excel export of the loaded rows (audited as EXPORT_EXCEL kind "audit").
 */
import { useMemo, useRef, useState } from "react";
import { ChevronDown, FileSpreadsheet, RefreshCw, ScrollText, SearchX } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, IconButton, PageHeader, toast } from "@/components/ui";
import { api, downloadBlob, errorMessage, MIME } from "@/lib/client/api";
import { fmtDateTime, fmtNumber } from "@/lib/client/format";
import { useToday } from "@/lib/client/hooks";
import { SCHOOL_NAME } from "@/lib/constants";
import { compactDate } from "@/lib/engine";
import type { AuditLog } from "@/lib/types";
import { AuditDetailSheet } from "./audit-detail-sheet";
import { AuditFilters } from "./audit-filters";
import { AuditStatsStrip } from "./audit-stats";
import { AuditTable } from "./audit-table";
import {
  AUDIT_EXPORT_COLUMNS,
  AUDIT_PAGE_SIZE,
  EMPTY_AUDIT_FORM,
  activeAuditFilterCount,
  applyLocalFilter,
  auditExportRows,
  auditFilterText,
  buildAuditFilter,
  type AppliedAuditFilter,
  type AuditFilterForm,
} from "./lib/audit-query";
import { useAuditLogs } from "./use-audit-logs";
import { useAuditStats } from "./use-audit-stats";

const sameForm = (a: AuditFilterForm, b: AuditFilterForm) => JSON.stringify(a) === JSON.stringify(b);

export function AuditScreen() {
  const today = useToday();
  const [form, setForm] = useState<AuditFilterForm>(EMPTY_AUDIT_FORM);
  // Latest form synchronously (Enter in the email box commits it right before the form submits).
  const formRef = useRef<AuditFilterForm>(EMPTY_AUDIT_FORM);
  const [appliedForm, setAppliedForm] = useState<AuditFilterForm>(EMPTY_AUDIT_FORM);
  const [applied, setApplied] = useState<AppliedAuditFilter>({ query: {} });
  const [error, setError] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [exporting, setExporting] = useState(false);

  const logs = useAuditLogs(applied);
  const stats = useAuditStats(today);
  const rows = useMemo(() => applyLocalFilter(logs.items, applied), [logs.items, applied]);
  const loading = logs.status === "loading";

  function setFormNow(next: AuditFilterForm) {
    formRef.current = next;
    setForm(next);
  }

  function patch(p: Partial<AuditFilterForm>) {
    setFormNow({ ...formRef.current, ...p });
    setError(undefined);
  }

  function apply(f: AuditFilterForm = formRef.current) {
    const r = buildAuditFilter(f);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setError(undefined);
    setAppliedForm(f);
    setApplied(r.filter);
  }

  function applyNow(f: AuditFilterForm) {
    setFormNow(f);
    apply(f);
  }

  async function loadMore() {
    const ok = await logs.loadMore();
    if (!ok) toast.error("Không tải thêm được bản ghi. Vui lòng thử lại.");
  }

  async function exportExcel() {
    if (rows.length === 0 || exporting) return;
    setExporting(true);
    try {
      const { exportSimpleSheet } = await import("@/lib/excel");
      const bytes = await exportSimpleSheet("Nhật ký hệ thống", AUDIT_EXPORT_COLUMNS, auditExportRows(rows, fmtDateTime), {
        sheetName: "Nhật ký",
        subtitle: `${SCHOOL_NAME} · ${auditFilterText(applied)} · ${fmtNumber(rows.length)} bản ghi · Xuất lúc ${fmtDateTime(new Date())}`,
      });
      downloadBlob(bytes, `NSHM_NhatKy_${compactDate(today)}.xlsx`, MIME.xlsx);
      toast.success("Đã xuất tệp Excel", { description: `${fmtNumber(rows.length)} bản ghi nhật ký` });
      try {
        await api.exportsLog({ kind: "audit", detail: { rows: rows.length, ...applied.query, emailContains: applied.localEmail } });
      } catch {
        toast.warning("Đã xuất tệp nhưng chưa ghi được nhật ký xuất dữ liệu.");
      }
    } catch (err) {
      toast.error(errorMessage(err, "Không xuất được tệp Excel. Vui lòng thử lại."));
    } finally {
      setExporting(false);
    }
  }

  const filtered = activeAuditFilterCount(appliedForm) > 0;
  const emptyState =
    logs.nextCursor ? (
      <EmptyState
        size="sm"
        icon={SearchX}
        title="Chưa thấy bản ghi phù hợp trong phần đã quét"
        description="Máy chủ quét nhật ký theo từng đợt. Bấm “Tìm tiếp” để quét các bản ghi cũ hơn."
        action={
          <Button variant="secondary" size="sm" icon={ChevronDown} loading={logs.loadingMore} onClick={() => void loadMore()}>
            Tìm tiếp
          </Button>
        }
      />
    ) : filtered ? (
      <EmptyState
        size="sm"
        icon={SearchX}
        title="Không có bản ghi phù hợp"
        description="Thử bỏ bớt điều kiện lọc hoặc mở rộng khoảng thời gian."
        action={
          <Button variant="secondary" size="sm" onClick={() => applyNow(EMPTY_AUDIT_FORM)}>
            Xóa lọc
          </Button>
        }
      />
    ) : (
      <EmptyState size="sm" icon={ScrollText} title="Chưa có nhật ký" description="Các lần đăng nhập và thao tác thay đổi dữ liệu sẽ được ghi lại tại đây." />
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={ScrollText}
        title="Nhật ký hệ thống"
        description="Theo dõi đăng nhập và mọi thao tác thay đổi dữ liệu. Nhật ký chỉ được ghi thêm, không thể sửa hay xóa."
        actions={
          <>
            <IconButton
              icon={RefreshCw}
              label="Tải lại nhật ký"
              variant="secondary"
              loading={loading && logs.pages > 0}
              onClick={() => {
                logs.reload();
                stats.reload();
              }}
            />
            <Button variant="secondary" icon={FileSpreadsheet} onClick={() => void exportExcel()} loading={exporting} disabled={rows.length === 0}>
              Xuất Excel
            </Button>
          </>
        }
      />

      <AuditStatsStrip
        stats={stats}
        loaded={rows.length}
        hasMore={!!logs.nextCursor}
        loadingRows={loading}
        onShowLogins={() => applyNow({ ...EMPTY_AUDIT_FORM, action: "LOGIN", from: today, to: today })}
        onShowFailed={() => applyNow({ ...EMPTY_AUDIT_FORM, action: "LOGIN_FAILED", from: today, to: today })}
      />

      <AuditFilters
        form={form}
        onChange={patch}
        onApply={() => apply()}
        onReset={() => applyNow(EMPTY_AUDIT_FORM)}
        today={today}
        pending={!sameForm(form, appliedForm)}
        error={error}
        loading={loading}
      />

      <Card
        title="Bản ghi nhật ký"
        subtitle={auditFilterText(applied)}
        icon={ScrollText}
        padding="none"
        footer={
          logs.status === "ready" && (rows.length > 0 || logs.nextCursor) ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-print-hide>
              <span className="num">
                Đang hiển thị {fmtNumber(rows.length)} bản ghi
                {applied.localEmail ? ` (lọc email chứa “${applied.localEmail}” trong ${fmtNumber(logs.items.length)} dòng đã tải)` : ""}
                {logs.nextCursor ? " · còn bản ghi cũ hơn" : " · đã hết"}
              </span>
              {logs.nextCursor && rows.length > 0 ? (
                <Button variant="secondary" size="sm" icon={ChevronDown} loading={logs.loadingMore} onClick={() => void loadMore()}>
                  Tải thêm {AUDIT_PAGE_SIZE} bản ghi
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {logs.status === "error" ? (
          <ErrorState message={logs.error} onRetry={logs.reload} size="sm" />
        ) : (
          <AuditTable items={rows} onOpen={setSelected} emptyState={emptyState} loading={loading} />
        )}
      </Card>

      <AuditDetailSheet log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
