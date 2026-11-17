"use client";
import { BellRing, RefreshCw, School } from "lucide-react";
import { Badge, Button, Card, Checkbox, Skeleton, Switch } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { ReportMailClassRecipients } from "@/lib/contract";
import { noticeCoverage, noticesWarning, type MailDraft } from "./lib/mail-form";
import { Notice } from "../shared/notice";

/** GET /api/reports/mail/recipients, as far as the coverage line needs it. */
export type CoverageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** `domainsKnown` = the response had allowed domains (saved ones or the sender's); without any, nothing can be checked. */
  | { status: "ready"; classes: ReportMailClassRecipients[]; domainsKnown: boolean }
  /** The account may not read report recipients (no report.send). */
  | { status: "hidden" };

export interface NoticesCardProps {
  notices: MailDraft["notices"];
  onChange: (notices: MailDraft["notices"]) => void;
  configured: boolean;
  coverage: CoverageState;
  onRetryCoverage: () => void;
  onOpenClasses: () => void;
  disabled: boolean;
  className?: string;
}

const MISSING_SHOWN = 24;

/** "Thông báo cho GVCN": master switch, kinds, when a notice is sent, and how many classes can receive one. */
export function NoticesCard({ notices, onChange, configured, coverage, onRetryCoverage, onOpenClasses, disabled, className }: NoticesCardProps) {
  const warning = noticesWarning(notices, configured);
  const set = (patch: Partial<MailDraft["notices"]>) => onChange({ ...notices, ...patch });
  return (
    <Card icon={BellRing} title="Thông báo cho GVCN" subtitle="Email gửi ngay cho GVCN khi điểm của lớp thay đổi." className={className}>
      <div className="flex flex-col gap-4">
        <Switch
          checked={notices.enabled}
          onChange={(v) => set({ enabled: v })}
          disabled={disabled}
          label="Gửi thông báo cho GVCN"
          description="Mỗi thay đổi là một thư riêng gửi GVCN của lớp liên quan."
        />
        <fieldset className="min-w-0 rounded-control bg-surface-2 px-3 py-2 ring-1 ring-inset ring-border" disabled={disabled || !notices.enabled}>
          <legend className="sr-only">Loại thông báo</legend>
          <Checkbox
            checked={notices.incidents}
            onChange={(v) => set({ incidents: v })}
            disabled={disabled || !notices.enabled}
            label="Khi trừ điểm (sự việc)"
            description="Ghi sự việc mới; sửa ngày, lớp, lỗi, điểm, học sinh, số lần hoặc phạm vi; xóa hoặc khôi phục sự việc."
          />
          <Checkbox
            checked={notices.rewards}
            onChange={(v) => set({ rewards: v })}
            disabled={disabled || !notices.enabled}
            label="Khi cộng điểm (điểm thưởng)"
            description="Ghi điểm thưởng; xác nhận đề xuất của GVCN; sửa ngày, lớp hoặc điểm; xóa hoặc khôi phục điểm thưởng."
          />
        </fieldset>
        {warning ? <Notice tone="warn">{warning}</Notice> : null}
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-5 text-slate-600">
          <li>Chỉ gửi khi Quản trị hoặc Cán bộ nền nếp thao tác trên phần mềm – không gửi khi GVCN tự thao tác, khi nhập từ Excel, ghi đợt kiểm tra hay phản hồi của GVCN.</li>
          <li>Đổi lớp của một bản ghi: lớp cũ nhận thư “chuyển sang lớp khác”, lớp mới nhận thư ghi nhận.</li>
          <li>Người nhận: tài khoản GVCN đang hoạt động được gán lớp (Cài đặt → Người dùng) và Email GVCN của lớp (Lớp &amp; GVCN), thuộc tên miền được phép.</li>
        </ul>
        <CoverageBlock coverage={coverage} onRetry={onRetryCoverage} onOpenClasses={onOpenClasses} />
      </div>
    </Card>
  );
}

function CoverageBlock({ coverage, onRetry, onOpenClasses }: { coverage: CoverageState; onRetry: () => void; onOpenClasses: () => void }) {
  if (coverage.status === "hidden") return null;
  if (coverage.status === "loading") return <Skeleton className="h-16 w-full" />;
  if (coverage.status === "error") {
    return (
      <Notice
        tone="bad"
        title="Chưa tải được danh sách email GVCN"
        action={
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={onRetry}>
            Thử lại
          </Button>
        }
      >
        {coverage.message}
      </Notice>
    );
  }
  if (!coverage.domainsKnown) {
    // No saved domain and no sender yet: every address would count as "outside the domains" – say so instead.
    return (
      <Notice title="Chưa xác định tên miền nhận thư">
        Chưa kiểm tra được email GVCN của các lớp. Cần khai báo hộp thư gửi (thẻ Kết nối gửi thư) hoặc nhập “Tên miền được phép” rồi lưu.
      </Notice>
    );
  }
  const c = noticeCoverage(coverage.classes);
  const complete = c.missing.length === 0;
  return (
    <div className="flex flex-col gap-2 rounded-control bg-surface-2 px-3 py-3 ring-1 ring-inset ring-border" aria-live="polite">
      <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-slate-700">
        <Badge tone={c.total === 0 ? "muted" : complete ? "ok" : "warn"} className="num">
          {fmtNumber(c.withEmail)}/{fmtNumber(c.total)} lớp
        </Badge>
        có email GVCN nhận được thư (theo tên miền đã lưu)
      </p>
      {c.missing.length > 0 ? (
        <>
          <p className="text-[13px] text-slate-600">Chưa có email GVCN:</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Lớp chưa có email GVCN">
            {c.missing.slice(0, MISSING_SHOWN).map((m) => (
              <li key={m.classCode}>
                <Badge tone="warn" variant="outline" title={m.teacher ? `GVCN: ${m.teacher}` : undefined}>
                  {m.classCode}
                </Badge>
              </li>
            ))}
            {c.missing.length > MISSING_SHOWN ? (
              <li>
                <Badge tone="muted">+{fmtNumber(c.missing.length - MISSING_SHOWN)} lớp</Badge>
              </li>
            ) : null}
          </ul>
          <Button size="sm" variant="secondary" icon={School} onClick={onOpenClasses} className="self-start">
            Mở Cài đặt → Lớp &amp; GVCN
          </Button>
        </>
      ) : null}
    </div>
  );
}
