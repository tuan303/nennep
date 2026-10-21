"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, CopyCheck, Pencil, RotateCcw, Trash, TriangleAlert } from "lucide-react";
import { Button, ConfirmDialog, DialogClose, Field, Sheet, Textarea, buttonClasses, toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import { weekdayLabelVN } from "@/lib/engine/dates";
import type { Incident, LevelDataset } from "@/lib/types";
import { EvidenceGallery } from "./evidence-gallery";
import { DetailSection, IncidentInfo, IncidentMeta, IncidentStudents, IncidentSummary, RedactedNotice } from "./incident-detail-body";
import { FeedbackSection } from "./incident-feedback";
import { RemediationSection } from "./incident-remediation";
import { useNow, useRetained } from "./hooks";
import {
  canDeleteIncident,
  canEditIncident,
  canGiveFeedback,
  canRemediate,
  canRestoreIncident,
  editWindowRemainingMs,
  formatRemaining,
  isIncidentRedacted,
  isTimeLimitedEdit,
} from "./lib/incident-access";
import { notDuplicateCodes } from "./lib/remediation";

export interface IncidentDetailSheetProps {
  ds: LevelDataset;
  /** Incident to show; null closes the sheet. */
  incident: Incident | null;
  onClose: () => void;
  /** Called after a successful mutation (feedback, delete, restore) – the dataset is refreshed already. */
  onChanged?: () => void;
  /** Makes named students clickable (e.g. open the StudentHistorySheet). */
  onOpenStudent?: (studentId: string) => void;
  /** Prefills the reason of "Xóa" (e.g. "Trùng với NN-…" from the duplicate review). */
  suggestedDeleteReason?: string;
}

/** Latest-known version of a record: max of its change timestamps. */
function stamp(i: Incident): string {
  return [i.createdAt, i.updatedAt ?? "", i.gvcnNoteAt ?? "", i.remediationAt ?? "", i.deletedAt ?? ""].reduce((a, b) => (b > a ? b : a), "");
}

/** Edit link target of the Nhập liệu screen. */
export function incidentEditHref(id: string): string {
  return `/nhap-lieu?edit=${encodeURIComponent(id)}`;
}

/**
 * Full detail of one incident with permission-aware actions: edit (ADMIN, or own ≤ 24h), delete with reason (ADMIN),
 * restore (ADMIN, soft-deleted records), GVCN feedback (GVCN of the class or ADMIN) and the biện pháp khắc phục
 * (GVCN of the class, ADMIN / EDITOR with incident.remediate – see canRemediate).
 */
export function IncidentDetailSheet({ ds, incident, onClose, onChanged, onOpenStudent, suggestedDeleteReason }: IncidentDetailSheetProps) {
  const base = useRetained(incident);
  const [fresh, setFresh] = useState<Incident | null>(null);
  const shown = base && fresh && fresh.id === base.id && stamp(fresh) >= stamp(base) ? fresh : base;

  const { profile } = useSession();
  const { refresh } = useDataset(ds.levelId);
  const now = useNow();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [restoring, setRestoring] = useState(false);
  const roster = useMemo(() => new Map(ds.students.map((s) => [s.id, s] as const)), [ds.students]);

  const afterMutation = async (updated?: Incident) => {
    if (updated) setFresh(updated);
    await refresh();
    onChanged?.();
  };

  if (!shown) return null;

  const redacted = isIncidentRedacted(ds, shown, profile);
  const canEdit = canEditIncident(profile, shown, now);
  const canDelete = canDeleteIncident(profile, shown);
  const canRestore = canRestoreIncident(profile, shown);
  const canFeedback = !redacted && canGiveFeedback(profile, shown);
  const canFix = canRemediate(profile, shown, { redacted });
  const reviewedCodes = notDuplicateCodes(shown, ds.incidents);
  const remaining = editWindowRemainingMs(shown, now);
  const editHint = canEdit && isTimeLimitedEdit(profile) ? `Thầy/cô ${formatRemaining(remaining)} để sửa sự việc này.` : undefined;

  async function confirmDelete() {
    if (!shown) return;
    try {
      await api.incidents.remove(shown.id, reason.trim());
      toast.success(`Đã xóa sự việc ${shown.code}.`);
      setReason("");
      await afterMutation();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Chưa xóa được sự việc. Vui lòng thử lại."));
      throw err;
    }
  }

  async function restore() {
    if (!shown) return;
    setRestoring(true);
    try {
      const updated = await api.incidents.restore(shown.id);
      toast.success(`Đã khôi phục sự việc ${shown.code}.`);
      await afterMutation(updated);
    } catch (err) {
      toast.error(errorMessage(err, "Chưa khôi phục được sự việc. Vui lòng thử lại."));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <Sheet
        open={incident !== null}
        onOpenChange={(open) => !open && onClose()}
        title={`Sự việc ${shown.code}`}
        description={`${weekdayLabelVN(shown.date)}, ${fmtDate(shown.date)} · Lớp ${shown.classCode}`}
        icon={ClipboardList}
        size="lg"
        footer={
          <div className="flex w-full items-center gap-2">
            {canDelete ? (
              <Button
                variant="ghost"
                icon={Trash}
                className="shrink-0 px-3 text-bad-strong hover:bg-bad-soft hover:text-bad-strong"
                onClick={() => {
                  setReason(suggestedDeleteReason ?? "");
                  setDeleteOpen(true);
                }}
              >
                <span className="max-sm:sr-only">Xóa</span>
              </Button>
            ) : null}
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
              <DialogClose asChild>
                <Button variant="secondary" className="flex-1 sm:flex-none">
                  Đóng
                </Button>
              </DialogClose>
              {canRestore ? (
                <Button icon={RotateCcw} loading={restoring} onClick={() => void restore()} className="flex-1 sm:flex-none">
                  Khôi phục
                </Button>
              ) : null}
              {canEdit ? (
                <Link href={incidentEditHref(shown.id)} onClick={onClose} className={buttonClasses({ variant: "primary", className: "flex-1 sm:flex-none" })}>
                  <Pencil aria-hidden className="size-[18px]" strokeWidth={2.25} />
                  Sửa
                </Link>
              ) : null}
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {shown.deletedAt ? (
            <p role="status" className="flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2.5 text-[13px] leading-5 text-bad-strong">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
              <span>
                Sự việc đã bị xóa lúc {fmtDateTime(shown.deletedAt)}
                {shown.deleteReason ? ` – lý do: ${shown.deleteReason}` : ""}. Sự việc không được tính vào báo cáo.
              </span>
            </p>
          ) : null}

          <IncidentSummary incident={shown} />
          <IncidentInfo ds={ds} incident={shown} redacted={redacted} />

          {redacted ? (
            <RedactedNotice />
          ) : (
            <>
              <DetailSection title={`Học sinh liên quan (${shown.relatedStudentCount})`}>
                <IncidentStudents incident={shown} roster={roster} onOpenStudent={onOpenStudent} />
              </DetailSection>

              {shown.detail?.trim() ? (
                <DetailSection title="Chi tiết">
                  <p className="whitespace-pre-line text-sm leading-6 text-slate-800">{shown.detail.trim()}</p>
                </DetailSection>
              ) : null}

              {shown.dataCheck !== "OK" && shown.dataIssues.length > 0 ? (
                <DetailSection title="Kiểm tra dữ liệu">
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-5 text-slate-700 marker:text-warn">
                    {shown.dataIssues.map((issue, k) => (
                      <li key={`${issue.code}-${k}`}>{issue.message}</li>
                    ))}
                  </ul>
                </DetailSection>
              ) : null}

              {reviewedCodes.length > 0 ? (
                <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] leading-5 text-slate-700 ring-1 ring-inset ring-border">
                  <CopyCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-ok-strong" strokeWidth={2.25} />
                  <span>
                    Đã rà soát: <strong className="font-semibold">không trùng</strong> với <span className="num">{reviewedCodes.join(", ")}</span>.
                  </span>
                </p>
              ) : null}

              <DetailSection title="Phản hồi của GVCN">
                <FeedbackSection key={`${shown.id}|${stamp(shown)}`} incident={shown} canEdit={canFeedback} onSaved={(u) => afterMutation(u)} />
              </DetailSection>

              <DetailSection title="Xử lý / khắc phục">
                <RemediationSection key={`fix|${shown.id}|${stamp(shown)}`} incident={shown} canEdit={canFix} onSaved={(u) => afterMutation(u)} />
              </DetailSection>

              <DetailSection
                title="Minh chứng"
                aside={shown.photoIds.length + shown.evidenceUrls.length > 0 ? `${shown.photoIds.length} ảnh · ${shown.evidenceUrls.length} liên kết` : undefined}
              >
                <EvidenceGallery photoIds={shown.photoIds} urls={shown.evidenceUrls} />
              </DetailSection>
            </>
          )}

          <IncidentMeta incident={shown} editHint={editHint} />
        </div>
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setReason("");
        }}
        tone="danger"
        title={`Xóa sự việc ${shown.code}?`}
        message="Sự việc sẽ không còn được tính vào điểm thi đua và báo cáo. Quản trị có thể khôi phục lại trong mục Dữ liệu."
        confirmLabel="Xóa sự việc"
        confirmDisabled={reason.trim().length < 3}
        onConfirm={confirmDelete}
      >
        <Field label="Lý do xóa" required hint="Tối thiểu 3 ký tự, được lưu vào nhật ký hệ thống.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Ví dụ: Ghi nhầm lớp, ghi trùng…" />
        </Field>
      </ConfirmDialog>
    </>
  );
}
