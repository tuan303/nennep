"use client";
import type { ReactNode } from "react";
import { School, TriangleAlert, UsersRound } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { LEVELS } from "@/lib/constants";
import type { LevelId } from "@/lib/types";
import { EmailListField } from "./email-list-field";
import {
  blockedEmailEntries,
  ccOverflowWarning,
  mailList,
  mailListLabel,
  overflowWarning,
  recipientCapacity,
  type MailDraft,
  type MailErrors,
  type MailListId,
} from "./lib/mail-form";

export interface RecipientsCardProps {
  levelId: LevelId;
  draft: MailDraft;
  errors: MailErrors;
  /** Effective allowed domains of the draft ([] = unknown: nothing is flagged). */
  domains: readonly string[];
  onListChange: (id: MailListId, list: string[]) => void;
  onOpenClasses: () => void;
  disabled: boolean;
  className?: string;
}

const PLACEHOLDER = "Nhập hoặc dán địa chỉ email…";

/** Non-blocking warning in a list's hint (icon + text, never colour alone). */
function LimitWarning({ children }: { children: ReactNode }) {
  return (
    <span data-recipient-limit className="flex items-start gap-1.5 font-medium text-warn-strong">
      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
      <span>{children}</span>
    </span>
  );
}

/**
 * "Người nhận báo cáo": defaults of the "Gửi email" dialog of Báo cáo tuần/tháng (BGH, every Tổ khối, CC). Warns –
 * without blocking the save – when a list plus the CC list would exceed the per-email limit (that send is refused).
 */
export function RecipientsCard({ levelId, draft, errors, domains, onListChange, onOpenClasses, disabled, className }: RecipientsCardProps) {
  const capacity = recipientCapacity(draft, levelId, domains);
  const warningOf = (id: MailListId): string | undefined => {
    if (id === "cc") return ccOverflowWarning(capacity);
    const over = capacity.over.find((o) => o.id === id);
    return over ? overflowWarning(over) : undefined;
  };
  const field = (id: MailListId, text?: string) => {
    const list = mailList(draft, id);
    const warning = warningOf(id);
    const hint = warning ? (
      <>
        <LimitWarning>{warning}</LimitWarning>
        {text ? <span className="mt-1 block">{text}</span> : null}
      </>
    ) : (
      text
    );
    return (
      <EmailListField
        key={id}
        label={mailListLabel(id)}
        values={list}
        onChange={(next) => onListChange(id, next)}
        error={errors[id]}
        blocked={blockedEmailEntries(list, domains)}
        hint={hint}
        placeholder={PLACEHOLDER}
        disabled={disabled}
      />
    );
  };
  return (
    <Card
      icon={UsersRound}
      title="Người nhận báo cáo"
      subtitle="Người nhận mặc định khi bấm Gửi email ở Báo cáo tuần/tháng – người gửi vẫn bỏ chọn hoặc thêm địa chỉ trước khi gửi."
      className={className}
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13px] leading-5 text-slate-600">
          Gõ hoặc dán nhiều địa chỉ cùng lúc (cách nhau bởi dấu phẩy, chấm phẩy hoặc xuống dòng). Địa chỉ sai hiện màu đỏ – bấm vào để sửa; địa chỉ ngoài
          tên miền được phép hiện màu vàng.
        </p>
        {field("bgh", "Nhận báo cáo Ban Giám hiệu của cấp này.")}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {LEVELS[levelId].grades.map((g) => field(`grade-${g}`, `Nhận báo cáo Tổ khối ${g}.`))}
        </div>
        {field("cc", "Nhận bản sao (CC) của mọi thư báo cáo của cấp này, ví dụ văn phòng nhà trường.")}
        <div className="flex flex-col gap-2 rounded-control bg-surface-2 px-3 py-3 text-[13px] leading-5 text-slate-600 ring-1 ring-inset ring-border sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong className="text-slate-800">GVCN từng lớp</strong> nhận báo cáo của lớp mình theo email GVCN – không cần nhập ở đây.
          </p>
          <Button size="sm" variant="secondary" icon={School} onClick={onOpenClasses} className="shrink-0 self-start sm:self-auto">
            Lớp &amp; GVCN
          </Button>
        </div>
      </div>
    </Card>
  );
}
