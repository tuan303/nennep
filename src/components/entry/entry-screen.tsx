"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Award, ClipboardCheck, ClipboardPen } from "lucide-react";
import { DatasetGate } from "@/components/app/shell";
import { InspectionsWorkspace } from "@/components/inspections/inspections-workspace";
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, buttonClasses, toast } from "@/components/ui";
import { useLevel } from "@/lib/client/data";
import { fmtDate } from "@/lib/client/format";
import { useIsMobile, useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import { weekdayLabelVN } from "@/lib/engine/dates";
import { EntryWorkspace } from "./entry-workspace";
import { levelOfRecordId } from "./lib/edit-access";
import { ENTRY_TAB_LABELS, entryTabQuery, entryTabsFor, resolveEntryTab, type EntryTab } from "./lib/entry-tabs";
import { entryDrafts } from "./lib/form-model";
import { draftPrefix } from "./lib/leave-guard";
import { useEditTarget } from "./use-edit-target";

const TAB_ICONS = { "su-viec": ClipboardPen, "kiem-tra": ClipboardCheck } as const;

/**
 * "/nhap-lieu" (SCR-07): record incidents fast on any device; `?edit=<doc id>` opens a record in edit mode
 * (switching to the record's level when needed). REQ_V2 §7.1: tabs "Sự việc" | "Đợt kiểm tra" (`?tab=kiem-tra`,
 * inspection.manage); edit mode forces "Sự việc". A visited tab stays mounted, so switching never loses input.
 */
export function EntryScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/nhap-lieu";
  const today = useToday();
  // Phones: keep the header short so the form starts above the fold.
  const phone = useIsMobile();
  const { can, profile } = useSession();
  const uid = profile?.uid;
  const { levelId, setLevelId, accessibleLevels } = useLevel();
  const editId = params.get("edit")?.trim() || null;
  const edit = useEditTarget(editId);
  const access = { incidents: can("incident.create"), inspections: can("inspection.manage") };
  const mountable = entryTabsFor(access);
  const shownTabs = entryTabsFor({ ...access, editing: !!editId });
  const tab = resolveEntryTab(params.get("tab"), { ...access, editing: !!editId });
  const [visited, setVisited] = useState<ReadonlySet<EntryTab>>(() => new Set(tab ? [tab] : []));
  if (tab && !visited.has(tab)) setVisited(new Set([...visited, tab]));

  const switchTab = useCallback(
    (next: string) => {
      const t = mountable.find((x) => x === next);
      if (!t) return;
      const rest = entryTabQuery(params.toString(), t);
      router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
    },
    [mountable, params, pathname, router],
  );

  const clearEdit = useCallback(() => {
    const q = new URLSearchParams(params.toString());
    q.delete("edit");
    const rest = q.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  // The detail sheet links here from any level: open the record's level once per edit id.
  const switchedFor = useRef<string | null>(null);
  const loadedLevel = edit.status === "ready" ? edit.incident.levelId : undefined;
  useEffect(() => {
    if (!editId || switchedFor.current === editId) return;
    const target = loadedLevel ?? levelOfRecordId(editId);
    if (!target) return;
    switchedFor.current = editId;
    if (target !== levelId && accessibleLevels.includes(target)) setLevelId(target);
  }, [editId, loadedLevel, levelId, accessibleLevels, setLevelId]);

  // The form of a level is remounted when the level changes; its unsaved input is kept in memory (see EntryForm).
  const prevLevel = useRef(levelId);
  useEffect(() => {
    const prev = prevLevel.current;
    prevLevel.current = levelId;
    if (prev === levelId || !uid || !entryDrafts.hasPrefix(draftPrefix(uid, prev))) return;
    toast.info(`Sự việc đang nhập ở ${LEVELS[prev].short} chưa được lưu`, {
      description: `Thông tin đã được giữ lại – chọn lại ${LEVELS[prev].short} để nhập tiếp.`,
    });
  }, [levelId, uid]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        icon={ClipboardPen}
        eyebrow={`${LEVELS[levelId].short} · ${weekdayLabelVN(today)}, ${fmtDate(today)}`}
        title={editId ? "Sửa sự việc" : "Nhập liệu"}
        description={
          phone
            ? undefined
            : tab === "kiem-tra"
              ? "Ghi nhận các đợt kiểm tra nền nếp (ngày, buổi, mảng, lớp được kiểm tra) để đánh giá độ bao phủ và so sánh công bằng."
              : "Ghi nhận sự việc nền nếp nhanh chóng, kèm minh chứng. Điểm trừ được tính tự động theo bảng điểm lỗi."
        }
        actions={
          can("reward.create") && !phone ? (
            <Link href="/diem-thuong" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <Award aria-hidden className="size-4" strokeWidth={2.25} />
              Ghi điểm thưởng
            </Link>
          ) : null
        }
      />
      <DatasetGate>
        {(ds) => (
          <Tabs value={tab} onValueChange={switchTab}>
            {shownTabs.length > 1 ? (
              <TabsList aria-label="Loại dữ liệu nhập" className="mb-4">
                {shownTabs.map((t) => (
                  <TabsTrigger key={t} value={t} icon={TAB_ICONS[t]}>
                    {ENTRY_TAB_LABELS[t]}
                  </TabsTrigger>
                ))}
              </TabsList>
            ) : null}
            {mountable
              .filter((t) => visited.has(t))
              .map((t) => (
                <TabsContent key={t} value={t} forceMount className="data-[state=inactive]:hidden">
                  {t === "su-viec" ? (
                    <EntryWorkspace key={ds.levelId} ds={ds} today={today} edit={edit} onClearEdit={clearEdit} />
                  ) : (
                    <InspectionsWorkspace key={ds.levelId} ds={ds} today={today} />
                  )}
                </TabsContent>
              ))}
          </Tabs>
        )}
      </DatasetGate>
    </div>
  );
}
