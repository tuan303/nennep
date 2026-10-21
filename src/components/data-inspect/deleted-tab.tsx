"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Eye, RefreshCw, RotateCcw, SearchX, Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, SearchInput, SegmentedControl, toast, useIsMobile, type DataTableColumn } from "@/components/ui";
import { IncidentDetailSheet } from "@/components/app/widgets";
import { api, errorMessage } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtDate, fmtDateTime, fmtNumber, fmtPoints } from "@/lib/client/format";
import type { Incident, LevelDataset, Reward } from "@/lib/types";
import { RewardDetailSheet } from "./reward-detail-sheet";
import { deleteReasonText, deletedIncidentRow, deletedRewardRow, searchDeleted, sortDeleted, type DeletedRow } from "./lib/records";

type Kind = "incident" | "reward";
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; incidents: Incident[]; rewards: Reward[] };

function pointsCell(r: DeletedRow) {
  return r.kind === "incident" ? (
    <span className="num font-bold text-bad-strong">{fmtPoints(-r.points)}</span>
  ) : (
    <span className="num font-bold text-ok-strong">+{fmtNumber(r.points)}</span>
  );
}

/** "Đã xóa": soft-deleted incidents and rewards of the level (loaded on open) with restore (record.delete). */
export function DeletedTab({ ds }: { ds: LevelDataset }) {
  const { refresh } = useDataset(ds.levelId);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [kind, setKind] = useState<Kind>("incident");
  const [query, setQuery] = useState("");
  const [restoring, setRestoring] = useState<DeletedRow | null>(null);
  const [openIncident, setOpenIncident] = useState<Incident | null>(null);
  const [openReward, setOpenReward] = useState<Reward | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([api.incidents.listDeleted(ds.levelId), api.rewards.listDeleted(ds.levelId)])
      .then(([inc, rew]) => {
        if (!cancelled) setState({ status: "ready", incidents: inc.items, rewards: rew.items });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", message: errorMessage(err, "Chưa tải được danh sách đã xóa.") });
      });
    return () => {
      cancelled = true;
    };
  }, [ds.levelId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    const list = kind === "incident" ? state.incidents.map(deletedIncidentRow) : state.rewards.map(deletedRewardRow);
    return searchDeleted(sortDeleted(list), query);
  }, [state, kind, query]);

  async function restore(row: DeletedRow) {
    try {
      if (row.kind === "incident") await api.incidents.restore(row.id);
      else await api.rewards.restore(row.id);
      toast.success(`Đã khôi phục ${row.kind === "incident" ? "sự việc" : "điểm thưởng"} ${row.code}`, { description: "Bản ghi đã được tính lại vào thống kê." });
      setState((s) =>
        s.status === "ready" ? { ...s, incidents: s.incidents.filter((i) => i.id !== row.id), rewards: s.rewards.filter((r) => r.id !== row.id) } : s,
      );
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Chưa khôi phục được. Vui lòng thử lại."));
      throw err;
    }
  }

  const openRow = (r: DeletedRow) => {
    if (r.incident) setOpenIncident(r.incident);
    else if (r.reward) setOpenReward(r.reward);
  };

  const restoreButton = (r: DeletedRow) => (
    <Button
      variant="secondary"
      size="sm"
      icon={RotateCcw}
      onClick={(e) => {
        e.stopPropagation();
        setRestoring(r);
      }}
    >
      Khôi phục
    </Button>
  );

  const columns: ReadonlyArray<DataTableColumn<DeletedRow>> = [
    { key: "code", header: "Mã", cell: (r) => <span className="num whitespace-nowrap text-[13px] font-semibold text-brand-900">{r.code}</span>, sortValue: (r) => r.code },
    { key: "date", header: "Ngày", cell: (r) => <span className="num whitespace-nowrap">{fmtDate(r.date)}</span>, sortValue: (r) => r.date },
    { key: "class", header: "Lớp", cell: (r) => <span className="font-bold text-brand-900">{r.classCode}</span>, sortValue: (r) => r.classCode },
    { key: "content", header: "Nội dung", cell: (r) => <span className="line-clamp-2 min-w-[200px] max-w-[320px]">{r.content}</span> },
    { key: "points", header: "Điểm", align: "right", cell: pointsCell, sortValue: (r) => r.points },
    { key: "deletedAt", header: "Xóa lúc", cell: (r) => <span className="num whitespace-nowrap">{fmtDateTime(r.deletedAt)}</span>, sortValue: (r) => r.deletedAt },
    { key: "deletedBy", header: "Người xóa", cell: (r) => <span className="whitespace-nowrap text-[13px]">{r.deletedBy || "–"}</span>, sortValue: (r) => r.deletedBy },
    { key: "reason", header: "Lý do", cell: (r) => <span className="line-clamp-2 min-w-[160px] max-w-[260px] text-[13px]">{deleteReasonText(r.reason)}</span> },
    { key: "action", header: <span className="sr-only">Thao tác</span>, headerLabel: "Thao tác", align: "right", cell: restoreButton },
  ];

  const header = (
    <div className="flex flex-col gap-3 border-b border-border p-4 sm:px-5" data-print-hide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          ariaLabel="Loại bản ghi đã xóa"
          value={kind}
          onChange={setKind}
          options={[
            { value: "incident", label: state.status === "ready" ? `Sự việc · ${fmtNumber(state.incidents.length)}` : "Sự việc" },
            { value: "reward", label: state.status === "ready" ? `Điểm thưởng · ${fmtNumber(state.rewards.length)}` : "Điểm thưởng" },
          ]}
        />
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload} loading={state.status === "loading"}>
          Tải lại
        </Button>
      </div>
      <SearchInput value={query} onChange={setQuery} placeholder="Tìm mã, lớp, nội dung, người xóa, lý do…" ariaLabel="Tìm bản ghi đã xóa" className="md:max-w-md" />
    </div>
  );

  return (
    <Card padding="none" title="Bản ghi đã xóa" subtitle="Xóa mềm – có thể khôi phục. Danh sách gồm toàn bộ cấp học, không áp dụng bộ lọc kỳ." icon={Trash2}>
      <div className="border-t border-border">
        {header}
        {state.status === "error" ? (
          <ErrorState size="sm" message={state.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            loading={state.status === "loading"}
            onRowClick={isMobile ? undefined : openRow}
            rowLabel={(r) => `Xem ${r.kind === "incident" ? "sự việc" : "điểm thưởng"} ${r.code}`}
            initialSort={{ key: "deletedAt", dir: "desc" }}
            pageSize={50}
            mobileCard={(r) => (
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="num truncate text-xs font-semibold text-slate-500">
                    {r.code} · {fmtDate(r.date)} · Lớp {r.classCode}
                  </span>
                  {pointsCell(r)}
                </div>
                <p className="text-sm text-slate-800">{r.content}</p>
                <p className="text-xs text-slate-500">
                  Xóa {fmtDateTime(r.deletedAt)} · {r.deletedBy || "–"} · {deleteReasonText(r.reason)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {restoreButton(r)}
                  <Button variant="ghost" size="sm" icon={Eye} onClick={() => openRow(r)}>
                    Chi tiết
                  </Button>
                </div>
              </div>
            )}
            emptyState={
              query ? (
                <EmptyState size="sm" icon={SearchX} title="Không tìm thấy bản ghi phù hợp" />
              ) : (
                <EmptyState size="sm" icon={ArchiveRestore} tone="ok" title={kind === "incident" ? "Không có sự việc đã xóa" : "Không có điểm thưởng đã xóa"} description="Các bản ghi bị xóa sẽ xuất hiện tại đây để có thể khôi phục." />
              )
            }
          />
        )}
      </div>

      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(o) => !o && setRestoring(null)}
        title={restoring ? `Khôi phục ${restoring.kind === "incident" ? "sự việc" : "điểm thưởng"} ${restoring.code}?` : "Khôi phục"}
        message="Bản ghi sẽ được tính lại vào thống kê, xếp hạng và báo cáo của cấp học."
        confirmLabel="Khôi phục"
        onConfirm={() => (restoring ? restore(restoring) : undefined)}
      />
      <IncidentDetailSheet ds={ds} incident={openIncident} onClose={() => setOpenIncident(null)} onChanged={reload} />
      <RewardDetailSheet ds={ds} reward={openReward} onClose={() => setOpenReward(null)} />
    </Card>
  );
}
