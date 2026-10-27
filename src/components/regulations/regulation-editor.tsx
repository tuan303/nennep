"use client";
/**
 * Editor of a quy chế (`regulations.manage` = ADMIN without level restriction): tên, năm học, nội dung in the light
 * markup (REGULATION_MARKUP) with a cheat-sheet and a live preview (side by side ≥ 1024px, "Soạn thảo | Xem trước"
 * below), the original PDF (replace / delete) and "Lưu" (PUT with `baseRev`; 409 → message + "Tải lại bản mới nhất").
 * Unsaved edits are guarded (reload / tab close, in-app links, "Hủy").
 */
import { useDeferredValue, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, Code, Copy, Eye, FilePenLine, FileText, FileUp, RefreshCw, Save, Trash2, TriangleAlert, X } from "lucide-react";
import { copyText } from "@/components/app/widgets/lib/clipboard";
import { useLeaveGuard } from "@/components/entry/use-leave-guard";
import { Badge, Button, Card, ConfirmDialog, Field, Input, SegmentedControl, Textarea, cn, toast, toneSoft } from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import { useToday } from "@/lib/client/hooks";
import { REGULATION_PDF_MAX_BYTES } from "@/lib/constants";
import { parseRegulation } from "@/lib/regulations/markup";
import type { Regulation, RegulationId } from "@/lib/types";
import {
  PDF_ACCEPT,
  REGULATION_LIMITS,
  draftErrors,
  draftFromRegulation,
  fileSizeText,
  pdfInfoLine,
  readPdfFile,
  regulationPutInput,
  regulationUpdatedLine,
  sameDraft,
  type RegulationDraft,
} from "./lib/regulation-form";
import { RegulationBody } from "./regulation-body";

export interface RegulationEditorProps {
  id: RegulationId;
  /** Stored version when the editor opened (undefined: never saved). */
  regulation?: Regulation;
  /** A save / PDF change succeeded: put the returned regulation in the shared cache. */
  onSaved: (reg: Regulation) => void;
  /** Leave the editor (after "Lưu", or "Hủy" once confirmed). */
  onClose: () => void;
  /** Refetch the regulations; resolves with the newest version of this one. */
  onReload: () => Promise<Regulation | undefined>;
}

type Pane = "write" | "preview";

const count = (n: number) => n.toLocaleString("vi-VN");

/** The markup in a few lines (same order as REGULATION_MARKUP in src/lib/contract.ts). */
const CHEATSHEET: ReadonlyArray<[code: string, meaning: string]> = [
  ["## CHƯƠNG I. QUY ĐỊNH CHUNG", "Tên chương"],
  ["### Điều 1. Phạm vi áp dụng", "Tên điều – hiện trong mục lục"],
  ["- Nội dung", "Gạch đầu dòng"],
  ["1. Nội dung", "Mục đánh số (giữ nguyên số đã gõ)"],
  ["| Cột 1 | Cột 2 |", "Bảng: dòng đầu là tiêu đề, dòng |---|---| không bắt buộc"],
  ["> Nội dung", "Ghi chú, lưu ý"],
  ["**chữ đậm**", "Chữ in đậm"],
];

function Cheatsheet({ defaultOpen }: { defaultOpen: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-control bg-surface-2 ring-1 ring-inset ring-border">
      <summary className="flex cursor-pointer select-none items-center gap-2 rounded-control px-3 py-2 text-[13px] font-semibold text-brand-900 outline-none focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:py-3">
        <Code aria-hidden className="size-4 text-slate-500" strokeWidth={2.25} />
        Cách định dạng nội dung
      </summary>
      <div className="border-t border-border px-3 pb-3 pt-2 text-[13px]">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[auto_minmax(0,1fr)]">
          {CHEATSHEET.map(([code, meaning]) => (
            <div key={code} className="contents">
              <dt>
                <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[12.5px] text-slate-800 ring-1 ring-inset ring-border">{code}</code>
              </dt>
              <dd className="text-slate-600 max-sm:mb-1">{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-slate-600">Dòng trống để tách đoạn; các dòng liền nhau được nối thành một đoạn. Không chép quốc hiệu, số hiệu, nơi nhận, chữ ký vào nội dung.</p>
      </div>
    </details>
  );
}

/** Inline message box (icon + text, never colour alone). */
function EditorAlert({ tone, title, children, action }: { tone: "warn" | "bad"; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === "bad" ? CircleAlert : TriangleAlert;
  return (
    <div role="alert" className={cn("flex flex-col gap-3 rounded-control px-3.5 py-3 ring-1 ring-inset", toneSoft[tone])}>
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.25} />
        <div className="min-w-0 text-[13.5px] leading-relaxed">
          <p className="font-semibold">{title}</p>
          {children ? <p className="mt-0.5 opacity-90">{children}</p> : null}
        </div>
      </div>
      {action ? <div className="flex flex-wrap gap-2 pl-7">{action}</div> : null}
    </div>
  );
}

export function RegulationEditor({ id, regulation, onSaved, onClose, onReload }: RegulationEditorProps) {
  const today = useToday();
  /** Version the draft is based on (its `rev` is the `baseRev` of every write). */
  const [base, setBase] = useState<Regulation | undefined>(regulation);
  const [initial, setInitial] = useState<RegulationDraft>(() => draftFromRegulation(id, regulation, today));
  const [draft, setDraft] = useState<RegulationDraft>(initial);
  const [pane, setPane] = useState<Pane>("write");
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string>();
  const [reloading, setReloading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<"upload" | "delete" | null>(null);
  const [pdfError, setPdfError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = !sameDraft(draft, initial);
  const errors = useMemo(() => draftErrors(draft), [draft]);
  const invalid = Object.keys(errors).length > 0;
  const shownErrors = showErrors ? errors : {};
  const bodyLength = draft.body.trim().length;
  const deferredBody = useDeferredValue(draft.body);
  const preview = useMemo(() => parseRegulation(deferredBody), [deferredBody]);
  const busy = saving || reloading || pdfBusy !== null;
  const baseRev = base?.rev ?? 0;

  // Reload / tab close and in-app links (sidebar, top bar, the quy chế switch) ask before dropping unsaved edits.
  const leaveGuard = useLeaveGuard({
    when: dirty,
    title: "Bỏ nội dung quy chế chưa lưu?",
    message: "Nội dung quy chế đang sửa chưa được lưu. Rời trang sẽ bỏ các thay đổi đó.",
    confirmLabel: "Bỏ thay đổi",
  });

  const set = (field: keyof RegulationDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }));

  async function save() {
    if (busy || conflict) return;
    if (invalid) {
      setShowErrors(true);
      setPane("write");
      return;
    }
    setSaving(true);
    try {
      const saved = await api.regulations.put(id, regulationPutInput(draft, baseRev));
      onSaved(saved);
      toast.success("Đã lưu quy chế", { description: `${saved.title} · mọi tài khoản xem được bản mới ngay.` });
      onClose();
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) setConflict(err.message);
      else toast.error("Chưa lưu được quy chế", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  /** After a 409: take the newest stored version (the draft is replaced – it can be copied first). */
  async function reloadLatest() {
    setReloading(true);
    try {
      const latest = await onReload();
      const next = draftFromRegulation(id, latest, today);
      setBase(latest);
      setInitial(next);
      setDraft(next);
      setConflict(undefined);
      setShowErrors(false);
      toast.success("Đã tải bản mới nhất của quy chế");
    } catch (err) {
      toast.error("Chưa tải lại được quy chế", { description: errorMessage(err) });
    } finally {
      setReloading(false);
    }
  }

  async function copyDraft() {
    if (await copyText(draft.body)) toast.success("Đã sao chép nội dung đang sửa");
    else toast.error("Không sao chép được – hãy chọn toàn bộ ô nội dung rồi sao chép thủ công.");
  }

  /** A PDF change bumps `rev` too: the draft stays, now based on the returned version. */
  function pdfDone(updated: Regulation, message: string) {
    setBase(updated);
    onSaved(updated);
    toast.success(message);
  }

  async function uploadPdf(file: File) {
    setPdfError(undefined);
    setPdfBusy("upload");
    try {
      const { name, data } = await readPdfFile(file);
      pdfDone(await api.regulations.putPdf(id, { name, data, baseRev }), "Đã cập nhật file PDF gốc");
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) setConflict(err.message);
      else setPdfError(errorMessage(err));
    } finally {
      setPdfBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePdf() {
    setPdfError(undefined);
    setPdfBusy("delete");
    try {
      pdfDone(await api.regulations.deletePdf(id, baseRev), "Đã xóa file PDF gốc");
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) {
        setConflict(err.message); // shown above the form; the confirmation closes
        return;
      }
      toast.error("Chưa xóa được file PDF gốc", { description: errorMessage(err) });
      throw err; // keep the confirmation open for a retry
    } finally {
      setPdfBusy(null);
    }
  }

  function cancel() {
    if (dirty) setConfirmCancel(true);
    else onClose();
  }

  const updated = regulationUpdatedLine(base);
  const actions = (
    <>
      <Button variant="secondary" icon={X} onClick={cancel} disabled={saving}>
        Hủy
      </Button>
      <Button icon={Save} onClick={() => void save()} loading={saving} disabled={!!conflict || reloading || pdfBusy !== null || (!dirty && !!base)}>
        Lưu
      </Button>
    </>
  );

  return (
    <Card
      data-print-hide
      icon={FilePenLine}
      headingLevel={2}
      title={base ? "Sửa quy chế" : "Soạn nội dung quy chế"}
      subtitle="Nội dung đã lưu hiển thị ngay cho mọi tài khoản, ở mọi cấp học."
      actions={
        dirty ? (
          <Badge tone="warn" dot>
            Chưa lưu
          </Badge>
        ) : null
      }
    >
      <div
        className="flex flex-col gap-5"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S" || e.key === "Enter")) {
            e.preventDefault();
            void save();
          }
        }}
      >
        {conflict ? (
          <EditorAlert
            tone="warn"
            title="Quy chế vừa được người khác cập nhật"
            action={
              <>
                <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copyDraft()}>
                  Sao chép nội dung đang sửa
                </Button>
                <Button size="sm" variant="secondary" icon={RefreshCw} loading={reloading} onClick={() => void reloadLatest()}>
                  Tải lại bản mới nhất
                </Button>
              </>
            }
          >
            {conflict} Thay đổi của bạn chưa được lưu và sẽ được thay bằng bản mới nhất khi tải lại – hãy sao chép nội dung đang sửa trước nếu cần giữ lại.
          </EditorAlert>
        ) : null}

        <fieldset disabled={saving || reloading} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
          <legend className="sr-only">Nội dung quy chế</legend>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Field label="Tên quy chế" required error={shownErrors.title}>
              <Input value={draft.title} maxLength={REGULATION_LIMITS.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Năm học" required error={shownErrors.schoolYear}>
              <Input value={draft.schoolYear} maxLength={REGULATION_LIMITS.schoolYear} placeholder="2026–2027" onChange={(e) => set("schoolYear", e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-col gap-3">
            <SegmentedControl<Pane>
              className="lg:hidden"
              fullWidth
              size="sm"
              ariaLabel="Soạn thảo hoặc xem trước"
              options={[
                { value: "write", label: "Soạn thảo", icon: Code },
                { value: "preview", label: "Xem trước", icon: Eye },
              ]}
              value={pane}
              onChange={setPane}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className={cn("flex min-w-0 flex-col gap-3", pane !== "write" && "max-lg:hidden")}>
                <Field
                  label="Nội dung"
                  required
                  error={shownErrors.body}
                  labelAside={
                    <span className={cn("num", bodyLength > REGULATION_LIMITS.body && "font-semibold text-bad-strong")}>
                      {count(bodyLength)}/{count(REGULATION_LIMITS.body)} ký tự
                    </span>
                  }
                >
                  <Textarea
                    autoGrow={false}
                    value={draft.body}
                    onChange={(e) => set("body", e.target.value)}
                    placeholder={"## CHƯƠNG I. QUY ĐỊNH CHUNG\n\n### Điều 1. Phạm vi áp dụng\nNội dung điều 1…"}
                    className="h-[60vh] min-h-80 font-mono leading-relaxed sm:text-[13px]"
                  />
                </Field>
                <Cheatsheet defaultOpen={!base} />
              </div>
              <section aria-label="Xem trước" className={cn("flex min-w-0 flex-col gap-1.5", pane !== "preview" && "max-lg:hidden")}>
                <p className="text-[13.5px] font-semibold leading-5 text-slate-800">
                  Xem trước
                  {preview.articleCount > 0 ? <span className="font-normal text-slate-500"> · {count(preview.articleCount)} điều</span> : null}
                </p>
                <div className="h-[60vh] min-h-80 overflow-y-auto rounded-control bg-surface p-4 ring-1 ring-inset ring-border-strong sm:p-5 max-lg:h-auto max-lg:max-h-none">
                  {preview.blocks.length > 0 ? (
                    <RegulationBody blocks={preview.blocks} anchors={false} />
                  ) : (
                    <p className="text-sm text-slate-500">Nội dung sẽ hiện ở đây khi thầy/cô gõ vào ô bên cạnh.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </fieldset>

        <section aria-labelledby={`pdf-${id}`} className="flex flex-col gap-3 rounded-control border border-border p-3.5 sm:p-4">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <FileText aria-hidden className="size-4" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h3 id={`pdf-${id}`} className="text-[14.5px] font-semibold text-brand-900">
                File PDF gốc
              </h3>
              <p className="break-words text-[13px] text-slate-600">{base?.pdf ? pdfInfoLine(base.pdf) : "Chưa có file PDF gốc."}</p>
            </div>
          </div>
          {base ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={PDF_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPdf(file);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={FileUp} loading={pdfBusy === "upload"} disabled={busy || !!conflict} onClick={() => fileRef.current?.click()}>
                  {base.pdf ? "Thay file PDF" : "Tải file PDF lên"}
                </Button>
                {base.pdf ? (
                  <Button variant="danger" icon={Trash2} loading={pdfBusy === "delete"} disabled={busy || !!conflict} onClick={() => setConfirmDelete(true)}>
                    Xóa file PDF
                  </Button>
                ) : null}
              </div>
              {pdfError ? (
                <p role="alert" className="flex items-start gap-1.5 text-[13px] text-bad-strong">
                  <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
                  {pdfError}
                </p>
              ) : null}
              <p className="text-xs text-slate-500">
                Chỉ nhận file .pdf, tối đa {fileSizeText(REGULATION_PDF_MAX_BYTES)}. Mọi tài khoản tải về bằng nút “Tải bản PDF gốc”; file mới thay hẳn file cũ.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-slate-600">Lưu nội dung lần đầu, sau đó mở lại “Sửa” để tải file PDF gốc lên.</p>
          )}
        </section>

        <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1" aria-live="polite">
            {showErrors && invalid ? (
              <p className="flex items-start gap-1.5 text-[13px] text-warn-strong">
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
                Chưa lưu được: {Object.values(errors)[0]}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">{updated ?? "Quy chế chưa được lưu lần nào."} · Ctrl + S để lưu.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">{actions}</div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title="Xóa file PDF gốc?"
        message="Mọi tài khoản sẽ không tải được bản PDF gốc nữa. Nội dung quy chế trên phần mềm không thay đổi."
        confirmLabel="Xóa file PDF"
        onConfirm={deletePdf}
      />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        tone="danger"
        title="Bỏ thay đổi chưa lưu?"
        message="Nội dung quy chế đang sửa sẽ không được lưu."
        confirmLabel="Bỏ thay đổi"
        cancelLabel="Tiếp tục sửa"
        onConfirm={onClose}
      />
      {leaveGuard}
    </Card>
  );
}
