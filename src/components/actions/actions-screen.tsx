"use client";
/**
 * /hanh-dong – Hành động điều hành (FR-ACT-001..003, FR-RAG-005, BR-ACT-01, AC-014):
 * Bản tóm tắt quyết định | Sổ hành động | Quá hạn & leo thang. Managing needs actions.manage (ADMIN);
 * Viewer / Editor read only.
 */
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlarmClock, ClipboardList, Eye, FileText, ListChecks, ListPlus, RefreshCw } from "lucide-react";
import { Badge, Button, IconButton, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useNavBadge } from "@/components/app/shell";
import { useDataset } from "@/lib/client/data";
import { useFilters } from "@/lib/client/filters";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import type { ActionItem, LevelDataset } from "@/lib/types";
import { ActionCreateDialog } from "./action-create-dialog";
import { ActionDetailSheet } from "./action-detail-sheet";
import { ActionRegister } from "./action-register";
import { BriefTab } from "./brief-tab";
import { formFromRecommendation, type ActionFormValues, type BriefRecommendation } from "./lib/action-form";
import { actionKpis } from "./lib/action-view";
import { SlaPanel } from "./sla-panel";
import { useActionList } from "./use-action-list";

const TABS = ["tom-tat", "so-hanh-dong", "qua-han"] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "tom-tat";

function isTab(v: string | null): v is Tab {
  return v !== null && (TABS as readonly string[]).includes(v);
}

/** Selected tab, mirrored to `?tab=` (other query params – the global filters – are kept). */
function useTab(): [Tab, (t: Tab) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = searchParams.get("tab");
  const [tab, setTabState] = useState<Tab>(isTab(fromUrl) ? fromUrl : DEFAULT_TAB);
  const setTab = useCallback(
    (t: Tab) => {
      setTabState(t);
      const p = new URLSearchParams(window.location.search);
      if (t === DEFAULT_TAB) p.delete("tab");
      else p.set("tab", t);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  return [tab, setTab];
}

interface CreateState {
  key: number;
  open: boolean;
  initial?: ActionFormValues;
  sourceText?: string;
}

export function ActionsScreen({ ds }: { ds: LevelDataset }) {
  const today = useToday();
  const { can } = useSession();
  const canManage = can("actions.manage");
  const { refresh } = useDataset(ds.levelId);
  const { filters } = useFilters();
  const list = useActionList(ds.levelId);
  const [tab, setTab] = useTab();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [create, setCreate] = useState<CreateState>({ key: 0, open: false });
  const [levelSeen, setLevelSeen] = useState(ds.levelId);
  if (levelSeen !== ds.levelId) {
    // Level switched: close the sheet / dialog that belonged to the previous level.
    setLevelSeen(ds.levelId);
    setSelectedId(null);
    setCreate((c) => ({ ...c, open: false }));
  }

  const items = list.items;
  const kpis = useMemo(() => actionKpis(items ?? [], today), [items, today]);
  const selected = useMemo(() => (selectedId ? (items?.find((i) => i.id === selectedId) ?? null) : null), [items, selectedId]);
  useNavBadge("/hanh-dong", kpis.overdue);

  const openAction = useCallback((item: ActionItem) => setSelectedId(item.id), []);

  const { upsert, reload } = list;
  const afterMutation = useCallback(
    async (item: ActionItem) => {
      upsert(item);
      await Promise.all([reload(), refresh()]);
    },
    [upsert, reload, refresh],
  );

  const startCreate = useCallback((initial?: ActionFormValues, sourceText?: string) => {
    setCreate((c) => ({ key: c.key + 1, open: true, initial, sourceText }));
  }, []);

  const createFromBrief = useCallback(
    (rec: BriefRecommendation, periodLabel: string) => {
      startCreate(formFromRecommendation(rec, { today, period: filters.period, periodLabel }), `Từ đề xuất của Bản tóm tắt quyết định – ${periodLabel}.`);
    },
    [startCreate, today, filters.period],
  );

  const viewCreated = useCallback(
    (item: ActionItem) => {
      setTab("so-hanh-dong");
      setSelectedId(item.id);
    },
    [setTab],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={ListChecks}
        eyebrow={LEVELS[ds.levelId].name}
        title="Hành động điều hành"
        description="Tóm tắt quyết định từ dữ liệu nền nếp, giao việc cải thiện và theo dõi thời hạn xử lý."
        actions={
          <>
            {!canManage ? (
              <Badge tone="muted" icon={Eye} title="Tài khoản của bạn chỉ được xem; việc tạo và cập nhật do quản trị thực hiện.">
                Chỉ xem
              </Badge>
            ) : null}
            <IconButton icon={RefreshCw} label="Tải lại danh sách hành động" variant="secondary" loading={list.refreshing && list.status === "ready"} onClick={() => void reload()} />
            {canManage ? (
              <Button icon={ListPlus} onClick={() => startCreate()}>
                Tạo hành động
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => isTab(v) && setTab(v)}>
        <TabsList aria-label="Nội dung hành động" data-print-hide>
          <TabsTrigger value="tom-tat" icon={FileText}>
            <span className="sm:hidden">Tóm tắt</span>
            <span className="max-sm:hidden">Bản tóm tắt quyết định</span>
          </TabsTrigger>
          <TabsTrigger value="so-hanh-dong" icon={ClipboardList} count={items ? kpis.open + kpis.doing : undefined}>
            Sổ hành động
          </TabsTrigger>
          <TabsTrigger value="qua-han" icon={AlarmClock} count={items && kpis.overdue > 0 ? kpis.overdue : undefined}>
            <span className="sm:hidden">Quá hạn</span>
            <span className="max-sm:hidden">Quá hạn &amp; leo thang</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tom-tat">
          <BriefTab ds={ds} today={today} actions={items} canManage={canManage} onCreate={createFromBrief} onOpenAction={openAction} />
        </TabsContent>
        <TabsContent value="so-hanh-dong">
          <ActionRegister list={list} today={today} canManage={canManage} onOpen={openAction} onCreate={() => startCreate()} onShowOverdue={() => setTab("qua-han")} />
        </TabsContent>
        <TabsContent value="qua-han">
          <SlaPanel list={list} today={today} sla={ds.config.actionSlaDays} canManage={canManage} onOpen={openAction} />
        </TabsContent>
      </Tabs>

      <ActionDetailSheet ds={ds} item={selected} today={today} canManage={canManage} onClose={() => setSelectedId(null)} onUpdated={afterMutation} />

      {canManage && create.key > 0 ? (
        <ActionCreateDialog
          key={create.key}
          open={create.open}
          onOpenChange={(open) => setCreate((c) => ({ ...c, open }))}
          ds={ds}
          today={today}
          initial={create.initial}
          sourceText={create.sourceText}
          onCreated={afterMutation}
          onView={viewCreated}
        />
      ) : null}
    </div>
  );
}
