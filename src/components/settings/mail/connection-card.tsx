"use client";
import type { ReactNode } from "react";
import { BookOpen, CircleCheck, PlugZap, Send, TriangleAlert } from "lucide-react";
import { guideHref } from "@/components/app/shell/routes";
import { Badge, Button, Card, buttonClasses } from "@/components/ui";
import type { MailStatus } from "@/lib/contract";
import { Notice } from "../shared/notice";

/** Guide section with the Microsoft 365 / Vercel setup checklist. */
export const MAIL_SETUP_GUIDE_ID = "thiet-lap-email";

export interface ConnectionCardProps {
  status: MailStatus;
  /** The signed-in user's email (recipient of the test message). */
  userEmail?: string;
  testing: boolean;
  onTest: () => void;
  className?: string;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-slate-800 max-sm:mb-1">{children}</dd>
    </div>
  );
}

/**
 * "Kết nối gửi thư": configured or not (missing variable names only, never a value), whether report PDFs can be
 * created (MailStatus.pdfWarning) + "Gửi thư thử tới tôi".
 */
export function ConnectionCard({ status, userEmail, testing, onTest, className }: ConnectionCardProps) {
  return (
    <Card
      icon={PlugZap}
      title="Kết nối gửi thư"
      subtitle="Microsoft 365 – thư gửi từ hộp thư của nhà trường."
      className={className}
      actions={
        status.configured ? (
          <Badge tone="ok" icon={CircleCheck}>
            Đã cấu hình
          </Badge>
        ) : (
          <Badge tone="warn" icon={TriangleAlert}>
            Chưa cấu hình
          </Badge>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {status.configured ? (
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[13.5px] sm:grid-cols-[auto_minmax(0,1fr)]">
            <Row label="Hộp thư gửi">
              {status.senderName ? `${status.senderName} · ` : ""}
              <span className="break-all">{status.sender ?? "–"}</span>
            </Row>
            <Row label="Tên miền nhận thư">{status.allowedDomains.length > 0 ? status.allowedDomains.join(", ") : "–"}</Row>
            <Row label="Liên kết trong thư">
              <span className="break-all">{status.baseUrl}</span>
            </Row>
          </dl>
        ) : (
          <Notice tone="warn" title="Phần mềm chưa gửi được email">
            <p>
              Máy chủ còn thiếu biến môi trường:{" "}
              {status.missing.map((name, i) => (
                <span key={name}>
                  {i > 0 ? ", " : null}
                  <code className="rounded bg-surface px-1 py-0.5 font-mono text-[12.5px] ring-1 ring-inset ring-border">{name}</code>
                </span>
              ))}
              .
            </p>
            <p className="mt-1">
              Quản trị CNTT khai báo các biến này trong Vercel (Settings → Environment Variables) rồi triển khai lại (Redeploy). Phần mềm chỉ hiển thị tên
              biến, không bao giờ hiển thị giá trị bí mật.
            </p>
          </Notice>
        )}
        {status.pdfWarning ? (
          <Notice tone="warn" title={`File PDF đính kèm đang tắt: ${status.pdfWarning}`}>
            Thư báo cáo vẫn được gửi nhưng không kèm file PDF (trong thư có liên kết mở báo cáo trên phần mềm); nút “Tải PDF” ở màn hình
            báo cáo tạm thời không dùng được.
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={Send} onClick={onTest} loading={testing} disabled={!status.configured}>
            Gửi thư thử tới tôi
          </Button>
          <a href={guideHref(MAIL_SETUP_GUIDE_ID)} target="_blank" rel="noopener" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            <BookOpen aria-hidden className="size-4" strokeWidth={2.25} />
            Hướng dẫn thiết lập
            <span className="sr-only"> (mở trong thẻ mới)</span>
          </a>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          {status.configured
            ? `Thư thử được gửi ngay tới ${userEmail ?? "email của bạn"} (tối đa 5 thư trong 10 phút). Không thấy thư? Xem cả hộp thư rác và Nhật ký gửi thư bên dưới.`
            : "Nút gửi thư thử dùng được sau khi cấu hình xong."}
        </p>
      </div>
    </Card>
  );
}
