"use client";
import { useCallback, useMemo, useState } from "react";
import { ClipboardList, School } from "lucide-react";
import { AccessNotice } from "@/components/app/shell";
import { IncidentDetailSheet, StudentHistorySheet } from "@/components/app/widgets";
import { PageHeader } from "@/components/ui";
import { useDataset } from "@/lib/client/data";
import { useFilters } from "@/lib/client/filters";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { LEVELS, isGvcnOfClass } from "@/lib/constants";
import { rosterNames, withRosterNames } from "@/components/entry/lib/student-names";
import { periodLabel } from "@/lib/engine";
import type { Incident, LevelDataset, Period } from "@/lib/types";
import { ClassChooser, ReportClassBar } from "./class-selector";
import { ClassRewards } from "./class-rewards";
import { FeedbackDialog } from "./feedback-dialog";
import { IncidentTable } from "./incident-table";
import { buildGvcnReport, ignoredReportFilters, ownClassesOf, resolveReportClass } from "./lib/report-model";
import { PrintSignatures, ReportPrintStyles } from "./print-parts";
import { ReportActions } from "./report-actions";
import { ReportHeader } from "./report-header";
import { ReportKpis } from "./report-kpis";
import { StudentConcerns } from "./student-concerns";

/** Báo GVCN (SCR-05): printable class report with KPIs, incident detail, GVCN feedback, students and rewards. */
export function GvcnReportScreen({ ds }: { ds: LevelDataset }) {
  const { filters, setFilters } = useFilters();
  const { profile } = useSession();
  const { refresh } = useDataset(ds.levelId);
  const today = useToday();

  const isGvcn = profile?.role === "GVCN";
  const ownClasses = useMemo(() => ownClassesOf(profile, ds.levelId, ds.classes), [profile, ds.levelId, ds.classes]);
  const { classCode, ignoredFilterClass } = resolveReportClass({ isGvcn, ownClasses, filterClass: filters.classCode });

  const pMode = filters.period.mode;
  const pKey = filters.period.key;
  const period = useMemo<Period>(() => (pKey ? { mode: pMode, key: pKey } : { mode: pMode }), [pMode, pKey]);
  const periodText = periodLabel(period, ds.config.semesters);
  const report = useMemo(() => (classCode ? buildGvcnReport(ds, classCode, period, today) : undefined), [ds, classCode, period, today]);

  // Selections keep only ids so the sheets always show the latest dataset version.
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const findIncident = useCallback((id: string | null) => (id ? (ds.incidents.find((i) => i.id === id) ?? null) : null), [ds.incidents]);
  const openIncident = useMemo(() => findIncident(incidentId), [findIncident, incidentId]);
  const roster = useMemo(() => rosterNames(ds.students), [ds.students]);
  const feedbackIncident = useMemo(() => {
    const found = findIncident(feedbackId);
    return found ? withRosterNames(found, roster) : null;
  }, [findIncident, feedbackId, roster]);

  const canFeedback = useCallback((i: Incident) => !i.deletedAt && isGvcnOfClass(profile, i.levelId, i.classCode), [profile]);
  const openRow = useCallback((i: Incident) => setIncidentId(i.id), []);
  const openFeedback = useCallback((i: Incident) => setFeedbackId(i.id), []);
  const pickClass = useCallback((code: string) => setFilters({ classCode: code }), [setFilters]);
  const ignoredFilters = useMemo(
    () => ignoredReportFilters({ category: filters.category, errorCode: filters.errorCode }, ds.catalog),
    [filters.category, filters.errorCode, ds.catalog],
  );
  const clearIgnoredFilters = useCallback(() => setFilters({ category: undefined, errorCode: undefined }), [setFilters]);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ReportPrintStyles />
      <PageHeader
        icon={ClipboardList}
        eyebrow={`${LEVELS[ds.levelId].short} · ${periodText}`}
        title="Báo GVCN"
        description="Báo cáo nền nếp theo lớp gửi giáo viên chủ nhiệm: sự việc, điểm thi đua, học sinh cần quan tâm và phản hồi của GVCN."
        actions={report ? <ReportActions ds={ds} report={report} periodText={periodText} today={today} /> : undefined}
        className="print:hidden"
      />

      {isGvcn && ownClasses.length === 0 ? (
        <AccessNotice
          icon={School}
          title="Chưa được gán lớp chủ nhiệm"
          description="Tài khoản của thầy/cô chưa được gán lớp chủ nhiệm ở cấp học này. Vui lòng liên hệ quản trị viên."
          action={null}
        />
      ) : (
        <>
          {classCode ? (
            <ReportClassBar
              ds={ds}
              period={period}
              classCode={classCode}
              isGvcn={isGvcn}
              ownClasses={ownClasses}
              ignoredFilterClass={ignoredFilterClass}
              ignoredFilters={ignoredFilters}
              onClearIgnoredFilters={clearIgnoredFilters}
              onChange={pickClass}
            />
          ) : null}
          {report ? (
            <div data-gvcn-report className="flex flex-col gap-4 sm:gap-5">
              <ReportHeader
                levelId={ds.levelId}
                schoolYear={ds.config.schoolYear}
                classCode={report.classCode}
                classInfo={report.classInfo}
                classSize={report.activeStudents}
                periodText={periodText}
                today={today}
              />
              <ReportKpis report={report} periodMode={period.mode} />
              <IncidentTable
                key={report.classCode}
                classCode={report.classCode}
                periodText={periodText}
                incidents={report.incidents}
                onOpen={openRow}
                onFeedback={openFeedback}
                canFeedback={canFeedback}
                isGvcn={isGvcn}
              />
              <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-12">
                <StudentConcerns className="xl:col-span-7" students={report.students} onOpen={setStudentId} />
                <ClassRewards className="xl:col-span-5" rewards={report.rewards} countedStatuses={report.countedStatuses} />
              </div>
              <PrintSignatures homeroomTeacher={report.classInfo?.homeroomTeacher} />
            </div>
          ) : (
            <ClassChooser ds={ds} period={period} grade={filters.grade} onPick={pickClass} />
          )}
        </>
      )}

      <IncidentDetailSheet ds={ds} incident={openIncident} onClose={() => setIncidentId(null)} onOpenStudent={setStudentId} />
      <StudentHistorySheet ds={ds} studentId={studentId} period={period} onClose={() => setStudentId(null)} onOpenIncident={openRow} />
      <FeedbackDialog incident={feedbackIncident} onClose={() => setFeedbackId(null)} onSaved={refresh} />
    </div>
  );
}
