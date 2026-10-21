"use client";
import { useState } from "react";
import type { Inspection, LevelDataset } from "@/lib/types";
import { InspectionDeleteDialog, InspectionEditDialog } from "./inspection-dialogs";
import { InspectionFormCard } from "./inspection-form-card";
import { InspectionList } from "./inspection-list";

export interface InspectionsWorkspaceProps {
  ds: LevelDataset;
  today: string;
}

/** Tab "Đợt kiểm tra" of /nhap-lieu: form (7/12 on desktops) + "Đợt kiểm tra gần đây" (5/12); one column on phones. */
export function InspectionsWorkspace({ ds, today }: InspectionsWorkspaceProps) {
  const [lastId, setLastId] = useState<string | undefined>();
  const [editing, setEditing] = useState<Inspection | null>(null);
  const [deleting, setDeleting] = useState<Inspection | null>(null);
  return (
    <>
      <div className="grid min-w-0 gap-5 xl:grid-cols-12 xl:items-start">
        <InspectionFormCard ds={ds} today={today} onCreated={(r) => setLastId(r.id)} className="min-w-0 xl:col-span-7" />
        <InspectionList ds={ds} today={today} highlightId={editing?.id ?? lastId} onEdit={setEditing} onDelete={setDeleting} className="xl:col-span-5" />
      </div>
      <InspectionEditDialog ds={ds} today={today} inspection={editing} onClose={() => setEditing(null)} />
      <InspectionDeleteDialog ds={ds} inspection={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
