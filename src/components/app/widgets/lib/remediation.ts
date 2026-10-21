/**
 * Biện pháp xử lý / khắc phục and "không trùng" reviews of an incident (REQ_V2 §7.5): payloads, display texts.
 * Pure – unit-tested.
 */
import type { GvcnFeedbackInput } from "@/lib/contract";
import { fmtDateTime } from "@/lib/client/format";
import type { Incident, IncidentStatus } from "@/lib/types";
import type { FeedbackRights } from "./incident-access";

/** Same limit as GvcnFeedbackSchema.remediation / .note. */
export const REMEDIATION_MAX = 1000;

/** Quick phrases for the remediation field (tap to append). */
export const REMEDIATION_PHRASES = [
  "Nhắc nhở trực tiếp học sinh.",
  "Trao đổi với phụ huynh.",
  "Học sinh viết bản cam kết.",
  "Lớp lao động vệ sinh khu vực.",
] as const;

/** Appends a quick phrase to the text ("A." + "B." → "A. B."). */
export function appendPhrase(text: string, phrase: string): string {
  const t = text.trim();
  if (!t) return phrase;
  if (t.includes(phrase)) return text;
  return `${t} ${phrase}`;
}

export interface FeedbackDraft {
  note?: string;
  status: IncidentStatus;
  remediation?: string;
}

/**
 * Body of POST /api/incidents/:id/feedback with only the changed fields the viewer may send (`rights`); null when
 * nothing changed (the API refuses an empty body). Text is trimmed; "" clears a stored note / remediation.
 */
export function feedbackChanges(
  incident: Pick<Incident, "gvcnNote" | "status" | "remediation">,
  draft: FeedbackDraft,
  rights: FeedbackRights = { note: true, status: true, remediation: true },
): GvcnFeedbackInput | null {
  const payload: GvcnFeedbackInput = {};
  if (rights.note && draft.note !== undefined && draft.note.trim() !== (incident.gvcnNote ?? "").trim()) payload.note = draft.note.trim();
  if (rights.remediation && draft.remediation !== undefined && draft.remediation.trim() !== (incident.remediation ?? "").trim()) {
    payload.remediation = draft.remediation.trim();
  }
  if (rights.status && draft.status !== incident.status) payload.status = draft.status;
  return Object.keys(payload).length > 0 ? payload : null;
}

/** "Nguyễn Văn A · 21/10/2026 10:05" (who changed the remediation last, and when); "" when unknown. */
export function remediationMeta(i: Pick<Incident, "remediationBy" | "remediationAt">): string {
  return [i.remediationBy?.trim() ?? "", i.remediationAt ? fmtDateTime(i.remediationAt) : ""].filter(Boolean).join(" · ");
}

/** Display code of an incident doc id (`${levelId}_${code}`): the code of the loaded record, else the id without its level prefix. */
export function codeOfIncidentId(id: string, incidents: readonly Pick<Incident, "id" | "code">[] = []): string {
  const found = incidents.find((i) => i.id === id);
  if (found) return found.code;
  const cut = id.indexOf("_");
  return cut >= 0 ? id.slice(cut + 1) : id;
}

/**
 * Codes the incident was reviewed as NOT a duplicate of (either side of the pair may hold the mark), natural order,
 * without duplicates.
 */
export function notDuplicateCodes(incident: Pick<Incident, "id" | "notDuplicateOf">, incidents: readonly Pick<Incident, "id" | "code" | "notDuplicateOf">[] = []): string[] {
  const ids = new Set(incident.notDuplicateOf ?? []);
  for (const other of incidents) if (other.id !== incident.id && other.notDuplicateOf?.includes(incident.id)) ids.add(other.id);
  ids.delete(incident.id);
  return [...new Set([...ids].map((id) => codeOfIncidentId(id, incidents)))].sort((a, b) => a.localeCompare(b));
}
