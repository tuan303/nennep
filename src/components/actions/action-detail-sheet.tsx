"use client";
/**
 * Action detail: all fields, history, edit form and workflow buttons (Bắt đầu → Doing, Hoàn thành → Done, Mở lại).
 * "Hoàn thành" without evidence is blocked here (AC-014) and the server's 400 message is shown if it still happens.
 */
import { useRef, useState } from "react";
import { CheckCheck, ClipboardList, Play, RefreshCw, RotateCcw, Save, type LucideIcon } from "lucide-react";
import { Button, Sheet, toast } from "@/components/ui";
import { useRetained } from "@/components/app/widgets";
import { api, errorMessage, fieldErrors } from "@/lib/client/api";
import { ACTION_STATUS_LABELS } from "@/lib/constants";
import type { ActionUpdateInput } from "@/lib/contract";
import type { ActionItem, ActionStatus, LevelDataset } from "@/lib/types";
import { ActionFormFields } from "./action-form-fields";
import { ActionHistory } from "./action-history";
import { ActionInfo, ActionSummary, DetailSection, LinkifiedText, OverdueNotice } from "./action-detail-body";
import {
  EVIDENCE_REQUIRED_MESSAGE,
  formFromAction,
  hasErrors,
  isPatchEmpty,
  statusChangePatch,
  statusSteps,
  toUpdatePatch,
  validateActionForm,
  type ActionFormErrors,
  type ActionFormValues,
} from "./lib/action-form";

export interface ActionDetailSheetProps {
  ds: Pick<LevelDataset, "classes" | "weeks" | "config">;
  /** Action to show; null closes the sheet. */
  item: ActionItem | null;
  today: string;
  canManage: boolean;
  onClose: () => void;
  /** After a successful update (the list should upsert + reload). */
  onUpdated: (item: ActionItem) => void | Promise<void>;
}

const STEP_ICON: Record<ActionStatus, LucideIcon> = { Open: RotateCcw, Doing: Play, Done: CheckCheck };

function stamp(i: ActionItem): string {
  return i.updatedAt ?? i.createdAt;
}

export function ActionDetailSheet({ ds, item, today, canManage, onClose, onUpdated }: ActionDetailSheetProps) {
  const shown = useRetained(item);
  /** The version the edit form started from (edits are diffed against it, never against a newer server copy). */
  const [seed, setSeed] = useState<ActionItem | undefined>(undefined);
  const [form, setForm] = useState<ActionFormValues | undefined>(undefined);
  const [errors, setErrors] = useState<ActionFormErrors>({});
  const [pending, setPending] = useState<"save" | ActionStatus | null>(null);
  const evidenceRef = useRef<HTMLTextAreaElement>(null);

  const reseed = (next: ActionItem) => {
    setSeed(next);
    setForm(formFromAction(next));
    setErrors({});
  };
  // Another action → start the form from it. A newer server version of the same action (someone else saved, or the
  // list reloaded) replaces the form only while it holds no unsaved edit; otherwise a notice offers to reload.
  // (Adjusting state while rendering.)
  const newer = !!shown && !!seed && shown.id === seed.id && stamp(shown) > stamp(seed);
  const editedSinceSeed = !!seed && !!form && !isPatchEmpty(toUpdatePatch(seed, form));
  if (shown && (!seed || seed.id !== shown.id || (newer && !editedSinceSeed))) reseed(shown);

  if (!shown || !seed || !form || seed.id !== shown.id) return null;
  const current = shown;
  const base = seed;
  const values = form;
  const dirty = editedSinceSeed;
  const staleForm = newer && dirty;

  function patch(p: Partial<ActionFormValues>) {
    setForm((f) => (f ? { ...f, ...p } : f));
    setErrors((e) => {
      const keys = Object.keys(p) as Array<keyof ActionFormValues>;
      if (!keys.some((k) => e[k])) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  function focusEvidence() {
    const el = evidenceRef.current;
    if (!el) return;
    el.focus();
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function send(kind: "save" | ActionStatus, body: ActionUpdateInput, successText: string) {
    setPending(kind);
    try {
      const updated = await api.actions.update(current.id, body);
      toast.success(successText, { description: `${updated.code} · ${updated.title}` });
      reseed(updated);
      await onUpdated(updated);
    } catch (err) {
      const fe = fieldErrors(err) as ActionFormErrors;
      const msg = errorMessage(err, "Không cập nhật được hành động. Vui lòng thử lại.");
      setErrors((prev) => ({ ...prev, ...fe }));
      if (fe.evidence) focusEvidence();
      toast.error(msg);
    } finally {
      setPending(null);
    }
  }

  function save() {
    const errs = validateActionForm(values);
    setErrors(errs);
    if (hasErrors(errs)) return toast.error("Vui lòng kiểm tra lại các trường được đánh dấu.");
    const body = toUpdatePatch(base, values);
    if (isPatchEmpty(body)) return toast("Chưa có thay đổi để lưu.");
    void send("save", body, "Đã lưu thay đổi");
  }

  function move(to: ActionStatus) {
    const errs = validateActionForm(values);
    const r = statusChangePatch(base, values, to);
    if ("error" in r) {
      setErrors({ ...errs, evidence: r.error });
      focusEvidence();
      toast.error(EVIDENCE_REQUIRED_MESSAGE, { description: "Nhập minh chứng vào ô “Minh chứng hoàn tất” rồi bấm Hoàn thành." });
      return;
    }
    setErrors(errs);
    if (hasErrors(errs)) return toast.error("Vui lòng kiểm tra lại các trường được đánh dấu.");
    void send(to, r.patch, `Đã chuyển sang “${ACTION_STATUS_LABELS[to]}”`);
  }

  const steps = canManage ? statusSteps(current.status) : [];
  const busy = pending !== null;

  return (
    <Sheet
      open={item != null}
      onOpenChange={(open) => !open && !busy && onClose()}
      // Unsaved edits: no accidental close by swipe / overlay tap / Esc (the × button still closes).
      dismissible={!dirty && !busy}
      title="Chi tiết hành động"
      description={`${current.code} · ${ACTION_STATUS_LABELS[current.status]}`}
      icon={ClipboardList}
      size="lg"
      footer={
        canManage ? (
          <>
            <Button variant="secondary" icon={Save} onClick={save} loading={pending === "save"} disabled={busy || !dirty}>
              Lưu thay đổi
            </Button>
            {steps.map((s) => (
              <Button key={s.to} variant={s.variant} icon={STEP_ICON[s.to]} onClick={() => move(s.to)} loading={pending === s.to} disabled={busy}>
                {s.label}
              </Button>
            ))}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        {canManage && staleForm ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-[13px] leading-5 text-warn-strong ring-1 ring-inset ring-warn/25">
            <p>
              <span className="font-semibold">Có phiên bản mới</span> – hành động vừa được cập nhật ở nơi khác. Thay đổi chưa lưu của bạn vẫn được giữ.
            </p>
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => reseed(current)} disabled={busy}>
              Tải lại (bỏ thay đổi)
            </Button>
          </div>
        ) : null}
        <ActionSummary item={current} today={today} />
        <OverdueNotice item={current} today={today} sla={ds.config.actionSlaDays} />
        <ActionInfo item={current} />

        {!canManage ? (
          <>
            {current.description ? (
              <DetailSection title="Mô tả">
                <LinkifiedText text={current.description} />
              </DetailSection>
            ) : null}
            <DetailSection title="Minh chứng hoàn tất">
              {current.evidence ? <LinkifiedText text={current.evidence} /> : <p className="text-sm text-slate-500">Chưa có minh chứng.</p>}
            </DetailSection>
          </>
        ) : (
          <DetailSection title="Cập nhật hành động" aside={dirty ? <span className="font-semibold text-warn-strong">Có thay đổi chưa lưu</span> : undefined}>
            <ActionFormFields ds={ds} value={values} onChange={patch} errors={errors} mode="edit" today={today} disabled={busy} evidenceRef={evidenceRef} />
          </DetailSection>
        )}

        <DetailSection title="Lịch sử" aside={`${current.history.length} mục`}>
          <ActionHistory history={current.history} />
        </DetailSection>
      </div>
    </Sheet>
  );
}
