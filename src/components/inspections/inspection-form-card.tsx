"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CircleAlert, ClipboardCheck, Save } from "lucide-react";
import { SAME_PATH } from "@/components/entry/lib/leave-guard";
import { payloadKey, requestFor, type PendingRequest } from "@/components/entry/lib/payload";
import { useLeaveGuard } from "@/components/entry/use-leave-guard";
import { Button, Card, CardFooter, toast } from "@/components/ui";
import { api, errorMessage, newClientRequestId } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtNumber } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import type { Inspection, LevelDataset } from "@/lib/types";
import { InspectionFields } from "./inspection-fields";
import {
  INSPECTION_MSG,
  inspectionDraftKey,
  inspectionDrafts,
  inspectionFormDirty,
  inspectionScopeLabel,
  newInspectionForm,
  nextInspectionForm,
  shiftForTime,
  toInspectionCreateInput,
  validateInspectionForm,
  type InspectionForm,
} from "./lib/inspection-form";

export interface InspectionFormCardProps {
  ds: LevelDataset;
  today: string;
  /** Called with the created round (e.g. to highlight it in the list). */
  onCreated?: (inspection: Inspection) => void;
  className?: string;
}

/**
 * "Ghi nhận đợt kiểm tra": idempotent create (clientRequestId reused while retrying the same payload), toast, dataset
 * refresh. Unsaved input is protected like the incident form (leave prompt + in-memory draft per level).
 */
export function InspectionFormCard({ ds, today, onCreated, className }: InspectionFormCardProps) {
  const { profile } = useSession();
  const { refresh } = useDataset(ds.levelId);
  const draftKey = inspectionDraftKey(profile?.uid, ds.levelId);
  const [start] = useState(() => {
    const base = newInspectionForm({ today, inspector: profile?.displayName, shift: shiftForTime(Date.now()) });
    const kept = draftKey ? inspectionDrafts.read(draftKey) : undefined;
    return { base, form: kept ?? base, restored: !!kept };
  });
  const [baseline, setBaseline] = useState<InspectionForm>(start.base);
  const [form, setForm] = useState<InspectionForm>(start.form);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const pending = useRef<PendingRequest | null>(null);
  const inFlight = useRef(false);

  const issues = useMemo(() => validateInspectionForm(form, ds, today), [form, ds, today]);
  const dirty = useMemo(() => inspectionFormDirty(form, baseline), [form, baseline]);

  useEffect(() => {
    if (!draftKey) return;
    if (dirty) inspectionDrafts.write(draftKey, form);
    else inspectionDrafts.clear(draftKey);
  }, [draftKey, form, dirty]);

  const announced = useRef(false);
  useEffect(() => {
    if (!start.restored || announced.current) return;
    announced.current = true;
    toast.info("Đã khôi phục đợt kiểm tra đang nhập dở", { description: "Thông tin thầy/cô nhập trước đó chưa được lưu và đã được giữ lại." });
  }, [start.restored]);

  const leaveGuard = useLeaveGuard({
    when: dirty,
    title: "Bỏ đợt kiểm tra đang nhập?",
    message: "Thông tin đợt kiểm tra (ngày, buổi, mảng, lớp) chưa được lưu và sẽ bị bỏ nếu rời trang này.",
    onDiscard: () => {
      if (draftKey) inspectionDrafts.clear(draftKey);
    },
    samePage: SAME_PATH,
  });

  async function save() {
    if (inFlight.current || saving) return;
    if (issues.length > 0) {
      setAttempted(true);
      toast.error(`Chưa thể lưu: ${issues[0]}`);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const payload = toInspectionCreateInput(ds.levelId, form, ds.classes);
      const request = requestFor(pending.current, payloadKey(payload), newClientRequestId);
      pending.current = request;
      const created = await api.inspections.create({ ...payload, clientRequestId: request.id });
      pending.current = null;
      toast.success(`Đã ghi nhận ${created.code} · ${fmtNumber(created.classCodes.length)} lớp`, {
        description: `${inspectionScopeLabel(created)}${created.shift ? ` · buổi ${created.shift.toLocaleLowerCase("vi")}` : ""}`,
      });
      const next = nextInspectionForm(form);
      if (draftKey) inspectionDrafts.clear(draftKey);
      setForm(next);
      setBaseline(next);
      setAttempted(false);
      inFlight.current = false;
      setSaving(false);
      onCreated?.(created);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Chưa lưu được đợt kiểm tra. Vui lòng thử lại."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  }

  const noClasses = attempted && issues.includes(INSPECTION_MSG.noClasses);

  return (
    <>
      <Card
        headingLevel={2}
        icon={ClipboardCheck}
        title="Ghi nhận đợt kiểm tra"
        subtitle="Lớp nào được kiểm tra, khi nào, mảng nào – để so sánh điểm trừ công bằng giữa các lớp."
        className={className}
        padding="none"
      >
        <form noValidate aria-label="Ghi nhận đợt kiểm tra" onSubmit={(e) => e.preventDefault()} onKeyDown={onKeyDown} className="p-4 pt-0 sm:p-5 sm:pt-0">
          <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">Thông tin đợt kiểm tra</legend>
            <InspectionFields ds={ds} form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} today={today} classesInvalid={noClasses} />
          </fieldset>
        </form>
        {/* Sticky above the phone bottom nav: the class grid is long, "Lưu" stays one tap away after "Chọn cả khối". */}
        <CardFooter className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 shadow-[0_-6px_12px_-10px_rgb(11_31_77/0.35)] md:bottom-0">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-[13px]" aria-live="polite">
              {issues.length > 0 ? (
                <span className="inline-flex items-start gap-1.5 text-warn-strong">
                  <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
                  <span>
                    {issues[0]}
                    {issues.length > 1 ? ` (+${issues.length - 1})` : ""}
                  </span>
                </span>
              ) : (
                <span className="num text-slate-600">
                  <strong className="text-brand-900">{fmtNumber(new Set(form.classCodes).size)}</strong> lớp · {form.category || "Kiểm tra chung"}
                  {form.shift ? ` · ${form.shift}` : ""}
                </span>
              )}
            </p>
            <Button icon={Save} onClick={() => void save()} loading={saving} disabled={issues.length > 0} className="max-sm:w-full">
              Lưu đợt kiểm tra
            </Button>
          </div>
        </CardFooter>
      </Card>
      {leaveGuard}
    </>
  );
}
