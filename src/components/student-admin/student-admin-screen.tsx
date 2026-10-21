"use client";
import { useCallback, useMemo, useState } from "react";
import { Download, FileUp, FilterX, Scale, SearchX, UserCog, UserPlus, Users } from "lucide-react";
import { IncidentDetailSheet, StudentHistorySheet } from "@/components/app/widgets";
import { Button, Card, EmptyState, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { useLevel } from "@/lib/client/data";
import { useToday } from "@/lib/client/hooks";
import { LEVELS } from "@/lib/constants";
import { ALL_PERIOD, studentStats } from "@/lib/engine";
import type { Incident, LevelDataset, StudentLite } from "@/lib/types";
import { AddStudentDialog } from "./add-student-dialog";
import { ClassSizeBoard } from "./class-size-board";
import { EditStudentDialog } from "./edit-student-dialog";
import { ImportSheet } from "./import/import-sheet";
import { PromoteDialog } from "./promote-dialog";
import { STATUS_FILTER_OPTIONS } from "./lib/labels";
import {
  activeFilterCount,
  activeWithViolations,
  buildRosterIndex,
  classSizeRows,
  DEFAULT_ROSTER_FILTERS,
  filterDescription,
  filterRoster,
  sizeSummary,
  statusCounts,
  violationCountMap,
  type RosterFilters,
} from "./lib/roster";
import { ReinstateDialog } from "./reinstate-dialog";
import { RosterTable } from "./roster-table";
import { RosterToolbar } from "./roster-toolbar";
import type { RowAction } from "./row-actions-menu";
import { StudentProfileSheet } from "./student-profile-sheet";
import { SummaryCards } from "./summary-cards";
import { TransferDialog } from "./transfer-dialog";
import { useRosterExport } from "./use-roster-export";
import { WithdrawDialog } from "./withdraw-dialog";

type Tab = "list" | "sizes";
type DialogKind = Exclude<RowAction, "profile" | "history">;

/** Quản lý học sinh (SCR-09): roster with local filters, class sizes, add / edit / transfer / withdraw / reinstate, import & export. */
export function StudentAdminScreen({ ds }: { ds: LevelDataset }) {
  const today = useToday();
  const { accessibleLevels } = useLevel();
  /** "Chuyển cấp" needs access to another level too (the server checks both). */
  const canPromote = accessibleLevels.some((l) => l !== ds.levelId);
  const [filters, setFilters] = useState<RosterFilters>(DEFAULT_ROSTER_FILTERS);
  const [tab, setTab] = useState<Tab>("list");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [dialog, setDialog] = useState<{ kind: DialogKind; id: string } | null>(null);

  const index = useMemo(() => buildRosterIndex(ds.students, ds.classes), [ds.students, ds.classes]);
  const rows = useMemo(() => filterRoster(index, filters), [index, filters]);
  const byId = useMemo(() => new Map(ds.students.map((s) => [s.id, s] as const)), [ds.students]);
  const counts = useMemo(() => statusCounts(ds.students), [ds.students]);
  const sizeRows = useMemo(() => classSizeRows(ds.classes, ds.students), [ds.classes, ds.students]);
  const size = useMemo(() => sizeSummary(sizeRows), [sizeRows]);
  const stats = useMemo(() => studentStats(ds, { period: ALL_PERIOD }, today), [ds, today]);
  const statById = useMemo(() => new Map(stats.map((s) => [s.id, s] as const)), [stats]);
  const violations = useMemo(() => violationCountMap(stats), [stats]);
  const withViolations = useMemo(() => activeWithViolations(ds.students, violations), [ds.students, violations]);

  const statusLabel = STATUS_FILTER_OPTIONS.find((o) => o.value === filters.status)?.label ?? "";
  const { exportList, exporting } = useRosterExport({ ds, rows, violations, today, description: filterDescription(filters, statusLabel) });

  const patchFilters = useCallback((patch: Partial<RosterFilters>) => setFilters((f) => ({ ...f, ...patch })), []);
  const onAction = useCallback((action: RowAction, s: StudentLite) => {
    if (action === "profile") setProfileId(s.id);
    else if (action === "history") setHistoryId(s.id);
    else setDialog({ kind: action, id: s.id });
  }, []);

  const dialogStudent = (kind: DialogKind) => (dialog?.kind === kind ? (byId.get(dialog.id) ?? null) : null);
  const closeDialog = () => setDialog(null);
  const filtered = activeFilterCount(filters) > 0;
  const levelName = LEVELS[ds.levelId].name;

  const emptyState =
    ds.students.length === 0 ? (
      <EmptyState
        icon={Users}
        title="Chưa có học sinh trong cấp học này"
        description="Nhập danh sách từ file Excel hoặc thêm từng học sinh."
        action={
          <>
            <Button variant="secondary" icon={FileUp} onClick={() => setImportOpen(true)}>
              Import danh sách
            </Button>
            <Button icon={UserPlus} onClick={() => setAddOpen(true)}>
              Thêm học sinh
            </Button>
          </>
        }
      />
    ) : (
      <EmptyState
        icon={SearchX}
        size="sm"
        title="Không tìm thấy học sinh phù hợp"
        description="Thử từ khóa khác hoặc bỏ bớt bộ lọc khối, lớp, trạng thái."
        action={
          <Button variant="secondary" size="sm" icon={FilterX} onClick={() => setFilters(DEFAULT_ROSTER_FILTERS)}>
            Xóa bộ lọc
          </Button>
        }
      />
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        // Three actions are wide: keep them under the title until 1280px so the title never gets squeezed.
        className="sm:flex-col sm:items-stretch xl:flex-row xl:items-end"
        icon={UserCog}
        eyebrow={`${levelName} · Năm học ${ds.config.schoolYear}`}
        title="Quản lý học sinh"
        description="Tuyển mới, chuyển đến, chuyển lớp, chuyển trường và cập nhật danh sách từ Excel."
        actions={
          // Phones: primary action full width on top, the two file actions side by side below.
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <Button icon={UserPlus} onClick={() => setAddOpen(true)} className="col-span-2 sm:order-last">
              Thêm học sinh
            </Button>
            <Button variant="secondary" icon={Download} loading={exporting} disabled={rows.length === 0} onClick={() => void exportList()} title="Xuất các học sinh đang lọc ra file Excel">
              <span className="sm:hidden">Xuất Excel</span>
              <span className="max-sm:hidden">Xuất danh sách</span>
            </Button>
            <Button variant="secondary" icon={FileUp} onClick={() => setImportOpen(true)}>
              <span className="sm:hidden">Import Excel</span>
              <span className="max-sm:hidden">Import danh sách</span>
            </Button>
          </div>
        }
      />

      <SummaryCards
        counts={counts}
        size={size}
        withViolations={withViolations}
        onShowActive={() => {
          patchFilters({ status: "ACTIVE" });
          setTab("list");
        }}
        onShowLeft={() => {
          patchFilters({ status: "LEFT" });
          setTab("list");
        }}
        onShowSizes={() => setTab("sizes")}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v === "sizes" ? "sizes" : "list")}>
        <TabsList aria-label="Nội dung">
          <TabsTrigger value="list" icon={Users} count={rows.length}>
            Danh sách học sinh
          </TabsTrigger>
          <TabsTrigger value="sizes" icon={Scale} count={size.mismatches > 0 ? size.mismatches : undefined}>
            Sĩ số theo lớp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card padding="none">
            <RosterToolbar
              ds={ds}
              filters={filters}
              onChange={patchFilters}
              summary={
                <>
                  <p aria-live="polite">
                    <strong className="num font-semibold text-brand-900">{fmtNumber(rows.length)}</strong> học sinh · {filterDescription(filters, statusLabel)}
                  </p>
                  {filtered ? (
                    <Button variant="ghost" size="sm" icon={FilterX} onClick={() => setFilters(DEFAULT_ROSTER_FILTERS)} data-print-hide>
                      Xóa bộ lọc
                    </Button>
                  ) : null}
                </>
              }
            />
            <RosterTable rows={rows} classes={ds.classes} violations={violations} onAction={onAction} canPromote={canPromote} emptyState={emptyState} />
          </Card>
        </TabsContent>

        <TabsContent value="sizes">
          <ClassSizeBoard
            rows={sizeRows}
            summary={size}
            onPickClass={(code) => {
              setFilters({ ...DEFAULT_ROSTER_FILTERS, classCode: code });
              setTab("list");
            }}
          />
        </TabsContent>
      </Tabs>

      <AddStudentDialog open={addOpen} onOpenChange={setAddOpen} ds={ds} today={today} defaultClass={filters.classCode} />
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} ds={ds} today={today} />

      <StudentProfileSheet
        ds={ds}
        student={profileId ? (byId.get(profileId) ?? null) : null}
        stat={profileId ? statById.get(profileId) : undefined}
        onClose={() => setProfileId(null)}
        onAction={onAction}
        canPromote={canPromote}
      />
      <EditStudentDialog ds={ds} student={dialogStudent("edit")} onClose={closeDialog} today={today} />
      <TransferDialog ds={ds} student={dialogStudent("transfer")} onClose={closeDialog} today={today} />
      <WithdrawDialog ds={ds} student={dialogStudent("withdraw")} onClose={closeDialog} today={today} />
      <ReinstateDialog ds={ds} student={dialogStudent("reinstate")} onClose={closeDialog} today={today} />
      <PromoteDialog ds={ds} student={dialogStudent("promote")} onClose={closeDialog} today={today} />

      <StudentHistorySheet ds={ds} studentId={historyId} onClose={() => setHistoryId(null)} onOpenIncident={setIncident} />
      <IncidentDetailSheet ds={ds} incident={incident} onClose={() => setIncident(null)} />
    </div>
  );
}
