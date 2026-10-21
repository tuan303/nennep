"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { BellRing, CalendarDays, Globe, Layers, ListChecks, School, Settings, SlidersHorizontal, Users, Wrench, type LucideIcon } from "lucide-react";
import { Badge, PageHeader, SkeletonCard, Tabs, TabsContent, TabsList, TabsTrigger, toast } from "@/components/ui";
import { DatasetGate, useShellOptions } from "@/components/app/shell";
import { SAME_PATH } from "@/components/entry/lib/leave-guard";
import { useLeaveGuard } from "@/components/entry/use-leave-guard";
import { useLevel } from "@/lib/client/data";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import type { LevelId } from "@/lib/types";
import { CatalogTab } from "./catalog/catalog-tab";
import { ClassesTab } from "./classes/classes-tab";
import { ConfigTab } from "./config/config-tab";
import { EarlyWarningTab } from "./early-warning/early-warning-tab";
import { SETTINGS_TABS, resolveTab, visibleTabs, type SettingsTabDef, type SettingsTabId } from "./lib/tabs";
import { MaintenanceTab } from "./maintenance/maintenance-tab";
import { SettingsProvider } from "./shared/settings-context";
import { UsersTab } from "./users/users-tab";
import { WeeksTab } from "./weeks/weeks-tab";

const ICONS: Record<SettingsTabId, LucideIcon> = {
  "cau-hinh": SlidersHorizontal,
  "canh-bao": BellRing,
  "danh-muc": ListChecks,
  lop: School,
  "lich-tuan": CalendarDays,
  "nguoi-dung": Users,
  "bao-tri": Wrench,
};

const TAB_SKELETON = <SkeletonCard rows={6} label="Đang tải cài đặt…" />;

function TabBody({ id }: { id: SettingsTabId }) {
  switch (id) {
    case "cau-hinh":
      return <DatasetGate fallback={TAB_SKELETON}>{(ds) => <ConfigTab key={ds.levelId} ds={ds} />}</DatasetGate>;
    case "canh-bao":
      return <DatasetGate fallback={TAB_SKELETON}>{(ds) => <EarlyWarningTab key={ds.levelId} ds={ds} />}</DatasetGate>;
    case "danh-muc":
      return <DatasetGate fallback={TAB_SKELETON}>{(ds) => <CatalogTab key={ds.levelId} ds={ds} />}</DatasetGate>;
    case "lop":
      return <DatasetGate fallback={TAB_SKELETON}>{(ds) => <ClassesTab key={ds.levelId} ds={ds} />}</DatasetGate>;
    case "lich-tuan":
      return <DatasetGate fallback={TAB_SKELETON}>{(ds) => <WeeksTab key={ds.levelId} ds={ds} />}</DatasetGate>;
    case "nguoi-dung":
      return <UsersTab />;
    case "bao-tri":
      return <DatasetGate fallback={TAB_SKELETON}>{(ds) => <MaintenanceTab key={ds.levelId} ds={ds} />}</DatasetGate>;
  }
}

function TabIntro({ def, levelId }: { def: SettingsTabDef; levelId: LevelId }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-[13.5px] leading-5 text-slate-600">{def.description}</p>
      {def.perLevel ? (
        <Badge tone="brand" variant="outline" icon={Layers}>
          Áp dụng: {LEVELS[levelId].name}
        </Badge>
      ) : (
        <Badge tone="star" icon={Globe}>
          Áp dụng toàn trường
        </Badge>
      )}
    </div>
  );
}

/** Cài đặt: tabs (deep link `?tab=`), each editor kept mounted after its first visit so drafts survive tab switches. */
export function SettingsScreen() {
  useShellOptions({ hideFilters: true });
  const { can } = useSession();
  const { levelId } = useLevel();
  const searchParams = useSearchParams();
  const tabs = useMemo(() => visibleTabs(can), [can]);

  const urlTab = searchParams?.get("tab") ?? null;
  const [tab, setTab] = useState<SettingsTabId | undefined>(() => resolveTab(urlTab, tabs));
  const [seenUrlTab, setSeenUrlTab] = useState(urlTab);
  if (urlTab !== seenUrlTab) {
    setSeenUrlTab(urlTab);
    setTab(resolveTab(urlTab, tabs));
  }
  const current = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  const [visited, setVisited] = useState<ReadonlySet<SettingsTabId>>(() => new Set(current ? [current] : []));
  if (current && !visited.has(current)) setVisited(new Set([...visited, current]));

  const goToTab = useCallback((id: SettingsTabId) => {
    setTab(id);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", id);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<SettingsTabId, boolean>>>({});
  const setDirty = useCallback((id: SettingsTabId, dirty: boolean) => {
    setDirtyTabs((cur) => (!!cur[id] === dirty ? cur : { ...cur, [id]: dirty }));
  }, []);
  const anyDirty = Object.values(dirtyTabs).some(Boolean);

  // Reload / tab close, in-app links and `requestLeave` callers ask first while an editor has unsaved changes.
  const discarded = useRef(false);
  const leaveGuard = useLeaveGuard({
    when: anyDirty,
    onDiscard: () => {
      discarded.current = true;
    },
    title: "Bỏ thay đổi chưa lưu?",
    message: `Còn thay đổi chưa lưu ở: ${SETTINGS_TABS.filter((t) => dirtyTabs[t.id]).map((t) => t.label).join(", ")}. Rời trang này sẽ bỏ các thay đổi đó.`,
    samePage: SAME_PATH, // ?tab= links keep every visited editor mounted
  });

  // Editors of a level remount when the level changes (the level switcher is not guarded yet – it can ask through
  // `requestLeave`): tell the user which unsaved edits were dropped.
  const prevLevel = useRef(levelId);
  useEffect(() => {
    if (prevLevel.current === levelId) return;
    const lost = SETTINGS_TABS.filter((t) => t.perLevel && dirtyTabs[t.id]).map((t) => t.label);
    const confirmed = discarded.current; // the user already agreed in the leave dialog
    discarded.current = false;
    if (lost.length > 0 && !confirmed) toast.warning(`Đã bỏ thay đổi chưa lưu của cấp ${LEVELS[prevLevel.current].short}`, { description: lost.join(", ") });
    prevLevel.current = levelId;
  }, [levelId, dirtyTabs]);

  const nav = useMemo(() => ({ setDirty, goToTab }), [setDirty, goToTab]);
  const currentDef = tabs.find((t) => t.id === current);

  let body: ReactNode = null;
  if (current) {
    body = (
      <Tabs value={current} onValueChange={(v) => goToTab(v as SettingsTabId)}>
        <TabsList aria-label="Mục cài đặt">
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} icon={ICONS[t.id]}>
              {t.label}
              {dirtyTabs[t.id] ? (
                <>
                  <span aria-hidden className="size-2 rounded-full bg-star-500" />
                  <span className="sr-only">(có thay đổi chưa lưu)</span>
                </>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs
          .filter((t) => visited.has(t.id))
          .map((t) => (
            <TabsContent key={t.id} value={t.id} forceMount className="data-[state=inactive]:hidden">
              <TabIntro def={t} levelId={levelId} />
              <TabBody id={t.id} />
            </TabsContent>
          ))}
      </Tabs>
    );
  }

  return (
    <SettingsProvider value={nav}>
      <div className="flex flex-col gap-5">
        <PageHeader
          icon={Settings}
          eyebrow={currentDef?.perLevel === false ? "Toàn trường" : `Cấp ${LEVELS[levelId].name}`}
          title="Cài đặt"
          description="Cấu hình thi đua, cảnh báo sớm, danh mục lỗi, lớp & GVCN, lịch tuần, người dùng và bảo trì hệ thống."
        />
        {body}
      </div>
      {leaveGuard}
    </SettingsProvider>
  );
}
