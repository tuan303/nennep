"use client";
import type { ReactNode } from "react";
import { Award, CircleCheck, CircleDashed, Trash2 } from "lucide-react";
import { Badge, Sheet, StatusBadge } from "@/components/ui";
import { EvidenceGallery, useRetained } from "@/components/app/widgets";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/client/format";
import { weekdayLabelVN } from "@/lib/engine/dates";
import type { LevelDataset, Reward } from "@/lib/types";
import { SourceBadge } from "./incident-columns";
import { Notice } from "./notice";
import { deleteReasonText } from "./lib/records";

export interface RewardDetailSheetProps {
  ds: Pick<LevelDataset, "classes" | "config">;
  reward: Reward | null;
  /** Whether the reward counts in the competition score (engine countedRewards). */
  counted?: boolean;
  onClose: () => void;
}

export function CountedBadge({ counted }: { counted: boolean }) {
  return counted ? (
    <Badge tone="ok" size="sm" icon={CircleCheck}>
      Được tính thi đua
    </Badge>
  ) : (
    <Badge tone="muted" size="sm" variant="outline" icon={CircleDashed}>
      Chưa tính
    </Badge>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-[13px] text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

/** Read-only detail of one reward (status, counted flag, evidence, metadata). */
export function RewardDetailSheet({ ds, reward, counted = false, onClose }: RewardDetailSheetProps) {
  const r = useRetained(reward);
  if (!r) return null;
  const cls = ds.classes.find((c) => c.code === r.classCode);
  return (
    <Sheet open={reward !== null} onOpenChange={(o) => !o && onClose()} title={`Điểm thưởng ${r.code}`} description={`Lớp ${r.classCode} · ${fmtDate(r.date)}`} icon={Award} size="md">
      <div className="flex flex-col gap-4">
        {r.deletedAt ? (
          <Notice tone="bad" icon={Trash2} title={`Đã xóa lúc ${fmtDateTime(r.deletedAt)}`}>
            {r.deletedBy ? `Người xóa: ${r.deletedBy}. ` : ""}Lý do: {deleteReasonText(r.deleteReason ?? "")}
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-ok-soft px-4 py-3 ring-1 ring-inset ring-ok/20">
          <span className="num text-3xl font-extrabold text-ok-strong">+{fmtNumber(r.points)}</span>
          <span className="text-sm font-medium text-ok-strong">điểm thưởng</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <StatusBadge status={r.status} size="sm" />
            {!r.deletedAt ? <CountedBadge counted={counted} /> : null}
          </span>
        </div>
        <p className="text-[15px] font-medium leading-relaxed text-slate-800">{r.reason}</p>
        <dl className="divide-y divide-border">
          <Row label="Ngày">
            {fmtDate(r.date)} · {weekdayLabelVN(r.date)}
          </Row>
          <Row label="Lớp">
            <strong className="text-brand-900">{r.classCode}</strong>
            {cls?.homeroomTeacher ? ` · GVCN ${cls.homeroomTeacher}` : ""}
          </Row>
          <Row label="Người ghi">{r.reporter || r.createdByName}</Row>
          {r.note ? <Row label="Ghi chú">{r.note}</Row> : null}
          <Row label="Nguồn">
            <SourceBadge source={r.source} size="md" />
            {r.externalId ? <span className="ml-2 text-xs text-slate-500">Mã trong file: {r.externalId}</span> : null}
          </Row>
          <Row label="Tạo lúc">
            {fmtDateTime(r.createdAt)} · {r.createdByName}
          </Row>
          {r.updatedAt ? <Row label="Cập nhật">{`${fmtDateTime(r.updatedAt)}${r.updatedBy ? ` · ${r.updatedBy}` : ""}`}</Row> : null}
        </dl>
        {!counted && !r.deletedAt ? (
          <p className="text-[13px] text-slate-500">
            Chỉ các trạng thái {ds.config.rewardCountedStatuses.map((s) => `“${s}”`).join(", ")} được cộng vào điểm thi đua.
          </p>
        ) : null}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-brand-900">Minh chứng</h3>
          <EvidenceGallery photoIds={r.photoIds} urls={r.evidenceUrls} />
        </section>
      </div>
    </Sheet>
  );
}
