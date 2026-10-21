"use client";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { IncidentDetailSheet, StudentHistorySheet } from "@/components/app/widgets";
import { useLevel } from "@/lib/client/data";
import { useSession } from "@/lib/client/session";
import type { Incident, LevelDataset } from "@/lib/types";
import { EditDenied, EditLoadError, EditLoading, EditOtherLevel } from "./edit-notices";
import { EntryForm } from "./entry-form";
import { entryEditAccess } from "./lib/edit-access";
import { rememberClass } from "./lib/form-model";
import { RecentPanel } from "./recent-panel";
import type { EditTarget } from "./use-edit-target";

export interface EntryWorkspaceProps {
  ds: LevelDataset;
  today: string;
  edit: EditTarget & { retry: () => void };
  /** Leaves edit mode (removes ?edit from the URL). */
  onClearEdit: () => void;
}

/**
 * Form (7/12 on desktops) + "Ghi nhận gần đây" (5/12); a single column on phones and tablets.
 * Owns the detail sheets and the "recent classes" memory (React state only).
 */
export function EntryWorkspace({ ds, today, edit, onClearEdit }: EntryWorkspaceProps) {
  const { profile } = useSession();
  const { setLevelId, accessibleLevels } = useLevel();
  const [recentClasses, setRecentClasses] = useState<string[]>([]);
  const [detail, setDetail] = useState<Incident | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);

  const onClassUsed = useCallback((code: string) => setRecentClasses((list) => rememberClass(list, code)), []);
  const target = edit.status === "ready" ? edit.incident : undefined;
  // Checked once per loaded record so an expiring window does not wipe a form being typed (the server re-checks).
  const access = useMemo(() => (target ? entryEditAccess(profile, target, Date.now()) : undefined), [profile, target]);

  const formProps = { ds, today, recentClasses, onClassUsed, onOpenDetail: setDetail, onCancelEdit: onClearEdit, onEditSaved: onClearEdit, onEditConflict: edit.retry };

  let main: ReactNode;
  if (edit.status === "idle") main = <EntryForm key="new" {...formProps} />;
  else if (edit.status === "loading") main = <EditLoading />;
  else if (edit.status === "error") main = <EditLoadError message={edit.error} onRetry={edit.retry} onNew={onClearEdit} />;
  else if (edit.incident.levelId !== ds.levelId) {
    const levelId = edit.incident.levelId;
    main = (
      <EditOtherLevel
        code={edit.incident.code}
        levelId={levelId}
        canSwitch={accessibleLevels.includes(levelId)}
        onSwitch={() => setLevelId(levelId)}
        onCancel={onClearEdit}
      />
    );
  } else if (access && !access.ok) {
    main = <EditDenied code={edit.incident.code} reason={access.reason} onView={() => setDetail(edit.incident)} onNew={onClearEdit} />;
  } else {
    // Keyed by revision: a record reloaded after a 409 (changed elsewhere) starts a fresh form from the new version.
    main = <EntryForm key={`${edit.incident.id}@${edit.incident.rev ?? 0}`} editing={edit.incident} {...formProps} />;
  }

  return (
    <>
      <div className="grid min-w-0 gap-5 xl:grid-cols-12 xl:items-start">
        <div className="min-w-0 xl:col-span-7">{main}</div>
        <RecentPanel ds={ds} today={today} editingId={target?.id} onOpen={setDetail} className="xl:col-span-5" />
      </div>
      <IncidentDetailSheet ds={ds} incident={detail} onClose={() => setDetail(null)} onOpenStudent={setStudentId} />
      <StudentHistorySheet
        ds={ds}
        studentId={studentId}
        onClose={() => setStudentId(null)}
        onOpenIncident={(i) => {
          setStudentId(null);
          setDetail(i);
        }}
      />
    </>
  );
}
