"use client";
import { useState } from "react";
import { Globe, ShieldCheck } from "lucide-react";
import { Badge, Card, Field, Input } from "@/components/ui";
import { domainListText, parseDomainList } from "./lib/mail-form";

export interface DomainsCardProps {
  /** Draft entries (valid ones normalised, invalid ones as typed). */
  domains: readonly string[];
  onChange: (domains: string[]) => void;
  /** Domains that apply with the current draft (its valid domains, or the sender's domain). */
  effective: readonly string[];
  /** Domain of the sending mailbox ("" when unknown). */
  senderDomain: string;
  error?: string;
  disabled: boolean;
  className?: string;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** "Tên miền được phép": comma list typed as text; the draft keeps the parsed entries. */
export function DomainsCard({ domains, onChange, effective, senderDomain, error, disabled, className }: DomainsCardProps) {
  // The text box keeps what is being typed ("a.edu.vn, "); it is rewritten only when the draft changes from elsewhere
  // (Hoàn tác, Tải bản mới nhất).
  const [text, setText] = useState(() => domainListText(domains));
  const [synced, setSynced] = useState(domains);
  if (synced !== domains) {
    setSynced(domains);
    if (!sameList(parseDomainList(text), domains)) setText(domainListText(domains));
  }

  return (
    <Card icon={Globe} title="Tên miền được phép" subtitle="Giới hạn nơi nhận thư để tránh gửi nhầm ra ngoài trường." className={className}>
      <div className="flex flex-col gap-4">
        <Field
          label="Tên miền"
          error={error}
          hint={`Thư chỉ gửi tới các địa chỉ thuộc các tên miền này (cách nhau bởi dấu phẩy). Để trống = chỉ tên miền của hộp thư gửi${senderDomain ? ` (${senderDomain})` : ""}.`}
        >
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const next = parseDomainList(e.target.value);
              if (!sameList(next, domains)) onChange(next);
            }}
            placeholder={senderDomain || "example.edu.vn"}
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-600">
          <ShieldCheck aria-hidden className="size-4 shrink-0 text-slate-500" strokeWidth={2.25} />
          <span>Đang áp dụng:</span>
          {effective.length > 0 ? (
            effective.map((d) => (
              <Badge key={d} tone="brand" variant="outline">
                {d}
              </Badge>
            ))
          ) : (
            <span className="font-medium text-warn-strong">chưa xác định – cần cấu hình hộp thư gửi hoặc nhập tên miền</span>
          )}
        </div>
      </div>
    </Card>
  );
}
