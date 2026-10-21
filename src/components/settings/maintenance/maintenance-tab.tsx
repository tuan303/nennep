"use client";
import { useState } from "react";
import { ArchiveRestore, DatabaseZap, ImageOff, Images, RefreshCcw, ScanSearch, Trash2, TriangleAlert } from "lucide-react";
import { Button, Card, ConfirmDialog, Field, Input, toast } from "@/components/ui";
import { api, errorMessage, type ResetLevelResult, type RestoreResetResult } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtDateTime, fmtNumber } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import type { LevelDataset } from "@/lib/types";
import type { EvidenceMaintenanceResult } from "@/lib/contract";
import { evidenceSummaryText, normalizeBatchId, rebuildCountsOf, rebuildSummaryText, resetConfirmText, storageText, type RebuildCounts } from "../lib/maintenance";
import { CopyField } from "../shared/copy-field";
import { Notice } from "../shared/notice";
import { SystemInfoCard } from "./system-info-card";

/** Tab "Bảo trì": rebuild digests, reset test data of the level (soft delete), restore a reset batch, system info. */
export function MaintenanceTab({ ds }: { ds: LevelDataset }) {
  const { can } = useSession();
  const { refresh } = useDataset(ds.levelId);
  const level = LEVELS[ds.levelId];
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [rebuilt, setRebuilt] = useState<{ at: string; counts?: RebuildCounts }>();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetResult, setResetResult] = useState<ResetLevelResult>();
  const [batchId, setBatchId] = useState("");
  const [batchTouched, setBatchTouched] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restored, setRestored] = useState<RestoreResetResult & { batchId: string }>();
  const [evidence, setEvidence] = useState<EvidenceMaintenanceResult & { at: string }>();
  const [checkingEvidence, setCheckingEvidence] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const canReset = can("data.reset");
  const cleanBatch = normalizeBatchId(batchId);
  const batchError = batchTouched && cleanBatch.length < 4 ? "Nhập mã đợt xóa (ít nhất 4 ký tự)." : undefined;

  async function rebuild() {
    try {
      const res = await api.admin.rebuildDigests({ levelId: ds.levelId });
      const counts = rebuildCountsOf(res, ds.levelId);
      setRebuilt({ at: new Date().toISOString(), counts });
      toast.success("Đã tính lại dữ liệu tổng hợp", { description: counts ? rebuildSummaryText(counts) : level.name });
      await refresh();
    } catch (err) {
      toast.error("Chưa tính lại được dữ liệu", { description: errorMessage(err) });
      throw err;
    }
  }

  async function resetLevel() {
    try {
      const res = await api.admin.resetLevel({ levelId: ds.levelId, confirmText: resetConfirmText(ds.levelId) });
      setResetResult(res);
      setBatchId(res.batchId);
      setRestored(undefined);
      toast.success(`Đã xóa dữ liệu thử nghiệm cấp ${level.short}`, {
        description: `${fmtNumber(res.incidents)} sự việc · ${fmtNumber(res.rewards)} điểm thưởng. Hãy lưu mã đợt xóa.`,
      });
      await refresh();
    } catch (err) {
      toast.error("Chưa xóa được dữ liệu", { description: errorMessage(err) });
      throw err;
    }
  }

  async function restore() {
    try {
      const res = await api.admin.restoreReset({ levelId: ds.levelId, batchId: cleanBatch });
      setRestored({ ...res, batchId: cleanBatch });
      toast.success("Đã khôi phục dữ liệu", { description: `${fmtNumber(res.incidents)} sự việc · ${fmtNumber(res.rewards)} điểm thưởng.` });
      await refresh();
    } catch (err) {
      toast.error("Chưa khôi phục được", { description: errorMessage(err) });
      throw err;
    }
  }

  /** Statistics only (dryRun) – nothing is deleted. */
  async function checkEvidence() {
    setCheckingEvidence(true);
    try {
      const res = await api.admin.evidence({ levelId: ds.levelId, dryRun: true });
      setEvidence({ ...res, at: new Date().toISOString() });
    } catch (err) {
      toast.error("Chưa kiểm tra được ảnh minh chứng", { description: errorMessage(err) });
    } finally {
      setCheckingEvidence(false);
    }
  }

  /** Permanently deletes the photos never attached to a record (older than 48 h). */
  async function purgeEvidence() {
    try {
      const res = await api.admin.evidence({ levelId: ds.levelId, dryRun: false });
      setEvidence({ ...res, at: new Date().toISOString() });
      toast.success(`Đã xóa ${fmtNumber(res.deleted)} ảnh minh chứng không dùng`, { description: `Cấp ${level.name} · ${storageText(res.orphanedBytes)} được giải phóng.` });
    } catch (err) {
      toast.error("Chưa xóa được ảnh", { description: errorMessage(err) });
      throw err;
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-5 lg:col-span-7">
        <Card icon={DatabaseZap} title="Tính lại dữ liệu tổng hợp" subtitle={`Cấp ${level.name}`}>
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-slate-600">
              Bảng điều khiển đọc dữ liệu từ các bản tổng hợp (theo tuần, học sinh, điểm thưởng, danh mục) để tải nhanh. Khi số liệu trên màn hình không khớp
              với dữ liệu gốc – ví dụ sau khi nhập file lớn bị gián đoạn – hãy tính lại. Thao tác mất khoảng vài giây đến một phút; nên làm lúc ít người đang
              nhập liệu.
            </p>
            {rebuilt ? (
              <Notice tone="ok" title={`Đã tính lại lúc ${fmtDateTime(rebuilt.at)}`}>
                {rebuilt.counts ? rebuildSummaryText(rebuilt.counts) : "Hoàn tất."}
              </Notice>
            ) : null}
            <div>
              <Button icon={RefreshCcw} onClick={() => setRebuildOpen(true)}>
                Tính lại cho cấp {level.short}
              </Button>
            </div>
          </div>
        </Card>

        {canReset ? (
          <Card icon={Images} title="Ảnh minh chứng" subtitle={`Cấp ${level.name}`}>
            <div className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-slate-600">
                Ảnh được tải lên khi nhập sự việc hoặc điểm thưởng. Ảnh của biểu mẫu bị bỏ dở (không gắn với bản ghi nào sau 48 giờ) chỉ chiếm dung lượng và
                chứa hình ảnh học sinh – nên xóa định kỳ. Ảnh của bản ghi đã xóa mềm vẫn được giữ để có thể khôi phục.
              </p>
              {evidence ? (
                <Notice tone={evidence.orphaned > 0 ? "warn" : "ok"} title={`${evidence.dryRun ? "Kiểm tra" : "Đã dọn"} lúc ${fmtDateTime(evidence.at)}`}>
                  {evidence.dryRun ? evidenceSummaryText(evidence) : `Đã xóa ${fmtNumber(evidence.deleted)} ảnh không dùng (${storageText(evidence.orphanedBytes)}).`}
                </Notice>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={ScanSearch} loading={checkingEvidence} onClick={() => void checkEvidence()}>
                  Kiểm tra ảnh minh chứng
                </Button>
                {evidence?.dryRun && evidence.orphaned > 0 ? (
                  <Button variant="danger" icon={ImageOff} onClick={() => setPurgeOpen(true)}>
                    Xóa {fmtNumber(evidence.orphaned)} ảnh không dùng
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        {canReset ? (
          <Card
            icon={TriangleAlert}
            title="Vùng nguy hiểm"
            subtitle="Chỉ dùng cho dữ liệu thử nghiệm hoặc khi bắt đầu năm học mới."
            className="border-bad/40 bg-gradient-to-b from-bad-soft/40 to-surface to-30%"
          >
            <div className="flex flex-col gap-5">
              <section className="flex flex-col gap-3" aria-labelledby="reset-title">
                <h4 id="reset-title" className="text-[15px] font-semibold text-bad-strong">
                  Xóa dữ liệu thử nghiệm của cấp
                </h4>
                <p className="text-sm leading-relaxed text-slate-600">
                  Ẩn (xóa mềm) toàn bộ <strong className="num">{fmtNumber(ds.incidents.length)}</strong> sự việc và{" "}
                  <strong className="num">{fmtNumber(ds.rewards.length)}</strong> điểm thưởng của cấp {level.name}. Học sinh, lớp, danh mục, cấu hình và tài
                  khoản giữ nguyên. Hệ thống trả về <strong>mã đợt xóa</strong> để khôi phục toàn bộ khi cần.
                </p>
                {resetResult ? (
                  <Notice tone="warn" title={`Đã xóa ${fmtNumber(resetResult.incidents)} sự việc và ${fmtNumber(resetResult.rewards)} điểm thưởng`}>
                    <CopyField label="Mã đợt xóa" value={resetResult.batchId} className="mt-2" />
                  </Notice>
                ) : null}
                <div>
                  <Button variant="danger" icon={Trash2} onClick={() => setResetOpen(true)}>
                    Xóa dữ liệu cấp {level.short}
                  </Button>
                </div>
              </section>

              <section className="flex flex-col gap-3 border-t border-border pt-5" aria-labelledby="restore-title">
                <h4 id="restore-title" className="text-[15px] font-semibold text-brand-900">
                  Khôi phục lần xóa
                </h4>
                <p className="text-sm leading-relaxed text-slate-600">
                  Nhập mã đợt xóa để hiển thị lại đúng các sự việc và điểm thưởng đã bị xóa trong đợt đó.
                </p>
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-start"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setBatchTouched(true);
                    if (cleanBatch.length >= 4) setRestoreOpen(true);
                  }}
                >
                  <Field label="Mã đợt xóa" error={batchError} className="min-w-0 flex-1">
                    <Input
                      value={batchId}
                      onChange={(e) => setBatchId(e.target.value)}
                      placeholder="VD: 8fK2mQ0xYb…"
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono"
                    />
                  </Field>
                  <Button type="submit" variant="secondary" icon={ArchiveRestore} className="sm:mt-[26px]">
                    Khôi phục
                  </Button>
                </form>
                {restored ? (
                  <Notice tone="ok" title="Đã khôi phục">
                    Đợt <span className="font-mono">{restored.batchId}</span>: {fmtNumber(restored.incidents)} sự việc · {fmtNumber(restored.rewards)} điểm
                    thưởng.
                  </Notice>
                ) : null}
              </section>
            </div>
          </Card>
        ) : null}
      </div>

      <SystemInfoCard ds={ds} className="lg:col-span-5" />

      <ConfirmDialog
        open={rebuildOpen}
        onOpenChange={setRebuildOpen}
        title={`Tính lại dữ liệu tổng hợp – ${level.name}?`}
        message="Người khác vẫn dùng được hệ thống; số liệu sẽ tự cập nhật khi hoàn tất. Nên thực hiện lúc ít người đang nhập liệu."
        confirmLabel="Tính lại"
        onConfirm={rebuild}
      />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        tone="danger"
        title={`Xóa dữ liệu thử nghiệm cấp ${level.name}?`}
        message={`${fmtNumber(ds.incidents.length)} sự việc và ${fmtNumber(ds.rewards.length)} điểm thưởng sẽ bị ẩn khỏi mọi màn hình và báo cáo ngay lập tức. Có thể khôi phục bằng mã đợt xóa.`}
        requireText={resetConfirmText(ds.levelId)}
        confirmLabel="Xóa dữ liệu"
        onConfirm={resetLevel}
      />
      <ConfirmDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        tone="danger"
        title={`Xóa ảnh minh chứng không dùng – ${level.name}?`}
        message={
          evidence
            ? `${fmtNumber(evidence.orphaned)} ảnh (${storageText(evidence.orphanedBytes)}) không gắn với sự việc hay điểm thưởng nào sẽ bị xóa vĩnh viễn. Ảnh của các bản ghi (kể cả bản ghi đã xóa mềm) được giữ nguyên.`
            : undefined
        }
        confirmLabel="Xóa vĩnh viễn"
        onConfirm={purgeEvidence}
      />
      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Khôi phục đợt xóa dữ liệu?"
        message={`Các sự việc và điểm thưởng đã xóa trong đợt “${cleanBatch}” của cấp ${level.name} sẽ hiển thị lại.`}
        confirmLabel="Khôi phục"
        onConfirm={restore}
      />
    </div>
  );
}
