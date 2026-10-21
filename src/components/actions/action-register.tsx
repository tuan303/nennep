"use client";
/** "Sổ hành động" tab: KPIs, search / priority filter, Kanban ↔ table. */
import { useEffect, useMemo, useState } from "react";
import { AlarmClock, CircleCheck, CircleDashed, ClipboardList, Columns3, ListPlus, LoaderCircle, Rows3, SearchX } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, KpiCard, SearchInput, SegmentedControl, Select, SkeletonCard } from "@/components/ui";
import { fmtPercent } from "@/lib/client/format";
import { PRIORITY_LABELS } from "@/lib/constants";
import type { ActionItem, Priority } from "@/lib/types";
import { ActionKanban } from "./action-kanban";
import { ActionTable } from "./action-table";
import { actionKpis, searchActions } from "./lib/action-view";
import type { ActionListState } from "./use-action-list";

type View = "kanban" | "table";
const VIEW_KEY = "nshm.actions.view";
const PRIORITY_OPTIONS = (["High", "Medium", "Low"] as const).map((p) => ({ value: p, label: `Ưu tiên ${PRIORITY_LABELS[p].toLowerCase()}` }));

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "table" ? "table" : "kanban";
  } catch {
    return "kanban";
  }
}

export interface ActionRegisterProps {
  list: ActionListState;
  today: string;
  canManage: boolean;
  onOpen: (item: ActionItem) => void;
  onCreate: () => void;
  onShowOverdue: () => void;
}

export function ActionRegister({ list, today, canManage, onOpen, onCreate, onShowOverdue }: ActionRegisterProps) {
  const [view, setView] = useState<View>("kanban");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<Priority | undefined>(undefined);

  useEffect(() => setView(readView()), []);
  const changeView = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // private mode – keep the choice for this visit only
    }
  };

  const items = list.items;
  const kpis = useMemo(() => actionKpis(items ?? [], today), [items, today]);
  const shown = useMemo(() => searchActions(items ?? [], { query, priority }), [items, query, priority]);
  const loading = list.status === "loading";
  const filtered = query.trim() !== "" || priority !== undefined;

  if (list.status === "error") {
    return (
      <Card padding="none">
        <ErrorState message={list.error} onRetry={() => void list.reload()} retrying={list.refreshing} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Mới mở" value={kpis.open} icon={CircleDashed} tone="brand" loading={loading} />
        <KpiCard label="Đang thực hiện" value={kpis.doing} icon={LoaderCircle} tone="warn" loading={loading} />
        <KpiCard
          label="Hoàn thành"
          value={kpis.done}
          icon={CircleCheck}
          tone="ok"
          loading={loading}
          footer={kpis.total > 0 ? `${fmtPercent(kpis.done / kpis.total)} tổng số hành động` : undefined}
        />
        <KpiCard
          label="Quá hạn"
          value={kpis.overdue}
          icon={AlarmClock}
          tone={kpis.overdue > 0 ? "bad" : "muted"}
          loading={loading}
          hint="Chưa hoàn thành và đã qua hạn xử lý."
          onClick={kpis.overdue > 0 ? onShowOverdue : undefined}
        />
      </div>

      <Card padding="sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Tìm theo nội dung, người phụ trách, lớp, mã…" ariaLabel="Tìm hành động" className="md:flex-1" />
          <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
            <Select<Priority>
              aria-label="Mức ưu tiên"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={setPriority}
              placeholder="Tất cả mức ưu tiên"
              allowEmpty
              wrapperClassName="min-w-0 sm:w-52"
            />
            <div className="sm:w-auto sm:shrink-0">
              <SegmentedControl<View>
                options={[
                  { value: "kanban", label: "Kanban", icon: Columns3 },
                  { value: "table", label: "Bảng", icon: Rows3 },
                ]}
                value={view}
                onChange={changeView}
                ariaLabel="Kiểu hiển thị"
                fullWidth
              />
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
          <SkeletonCard rows={2} />
        </div>
      ) : (items ?? []).length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={ClipboardList}
            title="Chưa có hành động nào"
            description={
              canManage
                ? "Tạo hành động mới hoặc chọn “Tạo hành động” từ đề xuất trong Bản tóm tắt quyết định."
                : "Khi Ban giám hiệu giao việc cải thiện nền nếp, các hành động sẽ hiển thị tại đây."
            }
            action={
              canManage ? (
                <Button icon={ListPlus} onClick={onCreate}>
                  Tạo hành động
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : filtered && shown.length === 0 ? (
        <Card padding="none">
          <EmptyState
            size="sm"
            icon={SearchX}
            title="Không có hành động phù hợp"
            description="Thử đổi từ khóa tìm kiếm hoặc mức ưu tiên."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setPriority(undefined);
                }}
              >
                Xóa bộ lọc
              </Button>
            }
          />
        </Card>
      ) : view === "kanban" ? (
        <ActionKanban items={shown} today={today} onOpen={onOpen} />
      ) : (
        <Card padding="none">
          <ActionTable items={shown} today={today} onOpen={onOpen} />
        </Card>
      )}
    </div>
  );
}
