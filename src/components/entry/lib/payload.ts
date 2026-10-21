/**
 * Form state → API payloads, and the idempotency key policy for create forms (AC-018). Pure – unit-tested.
 */
import type { IncidentCreateInput, IncidentUpdateInput } from "@/lib/contract";
import { normalizeCounts } from "@/lib/engine";
import type { Incident, LevelId, Unit } from "@/lib/types";
import type { EntryForm } from "./form-model";
import { checkEvidenceLinks } from "./links";

function distinct(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** Fields shared by create and update; counts are normalised exactly like the server does. */
function commonFields(form: EntryForm, unit: Unit) {
  const counts = normalizeCounts(unit, form.scope, form.occurrenceCount, form.unnamedCount);
  return {
    date: form.date,
    classCode: form.classCode,
    errorCode: form.errorCode,
    scope: form.scope,
    occurrenceCount: counts.occurrenceCount,
    studentIds: distinct(form.studentIds),
    unnamedCount: counts.unnamedCount,
    evidenceUrls: checkEvidenceLinks(form.links).urls,
    photoIds: [...form.photoIds],
    status: form.status,
  };
}

/** POST /api/incidents body without the idempotency key. Empty reporter → the server uses the creator's name. */
export function toIncidentCreateInput(levelId: LevelId, form: EntryForm, unit: Unit): Omit<IncidentCreateInput, "clientRequestId"> {
  const input: Omit<IncidentCreateInput, "clientRequestId"> = { levelId, ...commonFields(form, unit) };
  const reporter = form.reporter.trim();
  const detail = form.detail.trim();
  if (reporter) input.reporter = reporter;
  if (detail) input.detail = detail;
  return input;
}

/**
 * PATCH /api/incidents/:id body: every editable field (an empty detail clears it), plus `baseRev` = the revision the
 * form was opened from (the server answers 409 when someone changed the record meanwhile). The status is only sent
 * when the user changed it, so a GVCN's status update made while the form was open is never reverted.
 */
export function toIncidentUpdateInput(form: EntryForm, unit: Unit, original: Pick<Incident, "status" | "rev">): IncidentUpdateInput {
  const { status, ...fields } = commonFields(form, unit);
  return {
    ...fields,
    ...(status !== original.status ? { status } : {}),
    reporter: form.reporter.trim(),
    detail: form.detail.trim(),
    baseRev: original.rev ?? 0,
  };
}

/* ------------------------------ idempotency ------------------------------ */

/** The idempotency key of one submission attempt and the payload it was generated for. */
export interface PendingRequest {
  key: string;
  id: string;
}

/** Stable fingerprint of a payload (objects built by the helpers above have a fixed key order). */
export function payloadKey(payload: unknown): string {
  return JSON.stringify(payload);
}

/**
 * Re-use the previous `clientRequestId` while retrying the very same payload (a lost response must not create a
 * duplicate); any change to the payload starts a new attempt with a fresh id.
 */
export function requestFor(previous: PendingRequest | null, key: string, generate: () => string): PendingRequest {
  return previous && previous.key === key ? previous : { key, id: generate() };
}
