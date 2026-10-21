/**
 * AC-016 end-to-end on a SYNTHETIC legacy THCS workbook (src/lib/excel/__tests__/legacy-workbook.ts): runs in every
 * clone and CI. The real seed variant in admin-workbook.test.ts only runs where data/seed exists.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as commitPOST } from "@/app/api/imports/workbook/commit/route";
import { POST as previewPOST } from "@/app/api/imports/workbook/preview/route";
import { GET as datasetGET } from "@/app/api/dataset/route";
import type { ApiErrorBody, WorkbookCommitResult, WorkbookPayload, WorkbookPreview } from "../../contract";
import { buildLegacyWorkbook, LEGACY_EXPECTED, LEGACY_PEOPLE } from "../../excel/__tests__/legacy-workbook";
import { parseNshmWorkbook } from "../../excel/parse-workbook";
import type { AuditLog, Incident, LevelDataset, Student } from "../../types";
import { callRoute, createTestUser, getDoc, listDocs, setupTestProject } from "./helpers";

const PROJECT = "demo-test-admin-workbook-legacy";
const EXPECTED = LEGACY_EXPECTED.THCS;
let admin = "";

async function preview(payload: WorkbookPayload, options: Record<string, boolean> = {}) {
  return callRoute<WorkbookPreview & ApiErrorBody>(previewPOST, { method: "POST", url: "/api/imports/workbook/preview", token: admin, body: { payload, options } });
}
async function commit(payload: WorkbookPayload, previewHash: string, options: Record<string, boolean> = {}) {
  return callRoute<WorkbookCommitResult & ApiErrorBody>(commitPOST, { method: "POST", url: "/api/imports/workbook/commit", token: admin, body: { payload, options, previewHash } });
}
async function weekDigestCount(levelId: string): Promise<number> {
  const docs = await listDocs<{ levelId: string; kind: string; items: Incident[] }>("digests");
  return docs.filter((d) => d.levelId === levelId && d.kind === "inc").reduce((n, d) => n + d.items.length, 0);
}

describe("AC-016: synthetic THCS legacy workbook end-to-end", () => {
  let payload: WorkbookPayload;
  let first: WorkbookPreview;
  /** Incidents the preview accepts (= every row of the synthetic file). */
  let importable = 0;

  beforeAll(async () => {
    await setupTestProject(PROJECT);
    admin = (await createTestUser({ uid: "admin", role: "ADMIN", displayName: "Quản trị" })).token;
    payload = (await parseNshmWorkbook(await buildLegacyWorkbook("THCS"), "THCS.xlsx")).payload;
  });

  it("preview validates every section and writes nothing", async () => {
    expect(payload.classes).toHaveLength(EXPECTED.classes);
    expect(payload.incidents).toHaveLength(EXPECTED.incidents);
    const res = await preview(payload, { config: true });
    expect(res.status).toBe(200);
    first = res.body;
    const s = first.sections;
    expect(s.classes).toMatchObject({ total: EXPECTED.classes, willCreate: EXPECTED.classes, error: 0 });
    expect(s.catalog).toMatchObject({ total: EXPECTED.catalog, willCreate: EXPECTED.catalog, error: 0 });
    expect(s.config).toMatchObject({ total: 1, willCreate: 1 });
    expect(s.weeks).toMatchObject({ total: 42, willCreate: 42 });
    expect(s.students).toMatchObject({ total: EXPECTED.students, willCreate: EXPECTED.students, error: 0 });
    // Every legacy incident row is importable (problems become WARNING / Cần rà soát, never a silent drop).
    expect(s.incidents).toMatchObject({ total: EXPECTED.incidents, error: 0, willCreate: EXPECTED.incidents });
    importable = s.incidents.willCreate;
    // 2 links attach to incidents of the file; the orphan link (unknown incident code) is an ERROR row.
    expect(s.links).toMatchObject({ total: EXPECTED.links, error: 1, willCreate: 2 });
    expect(first.issues.every((i) => i.severity !== "OK")).toBe(true);
    expect(first.issues.some((i) => i.sheet === "Nhập liệu" && i.messages.some((m) => m.startsWith("Ghi chú trong file cũ:")))).toBe(true);
    expect(first.previewHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await listDocs("students")).toHaveLength(0);
    expect(await listDocs("incidents")).toHaveLength(0);
    expect(await listDocs("auditLogs")).toHaveLength(0);
  });

  it("commit writes canonical docs, digests, counters, batch + audit", async () => {
    const res = await commit(payload, first.previewHash, { config: true });
    expect(res.status).toBe(200);
    expect(res.body.created).toMatchObject({ classes: EXPECTED.classes, catalog: EXPECTED.catalog, weeks: 42, students: EXPECTED.students, incidents: importable });
    expect(res.body.review).toBeGreaterThan(0);

    const incidents = await listDocs<Incident>("incidents");
    expect(incidents).toHaveLength(importable);
    const linked = incidents.find((i) => i.code === "NN-20260923-0001");
    expect(linked).toMatchObject({ classCode: "9I0", errorCode: "L43", source: "import", externalId: "NN-20260923-0001", importBatchId: res.body.batchId });
    expect(linked?.students.map((s) => s.id)).toEqual([LEGACY_PEOPLE.thcs.linked.id]);
    expect(incidents.filter((i) => i.dataCheck === "REVIEW")).toHaveLength(res.body.review);
    expect(await listDocs<Student>("students")).toHaveLength(EXPECTED.students);

    const stu = await getDoc<{ items: unknown[] }>("digests", "THCS__stu");
    expect(stu?.items).toHaveLength(EXPECTED.students);
    expect(await weekDigestCount("THCS")).toBe(importable);
    expect((await getDoc<{ seq: number }>("counters", "NN_THCS_20260923"))?.seq).toBeGreaterThanOrEqual(1);

    const ds = await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: admin });
    expect(ds.status).toBe(200);
    expect(ds.body.incidents).toHaveLength(importable);
    expect(ds.body.students).toHaveLength(EXPECTED.students);
    expect(ds.body.classes).toHaveLength(EXPECTED.classes);
    expect(ds.body.weeks).toHaveLength(42);

    const batch = await getDoc<{ kind: string; levelId: string }>("importBatches", res.body.batchId);
    expect(batch).toMatchObject({ kind: "workbook", levelId: "THCS" });
    const audits = (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "IMPORT_EXCEL");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ entityId: res.body.batchId, levelId: "THCS", email: "admin@nshm.test" });
  });

  it("rejects a stale previewHash with 409", async () => {
    const res = await commit(payload, first.previewHash, { config: true });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Dữ liệu đã thay đổi, vui lòng xem trước lại");
  });

  it("re-import is idempotent (nothing to create or update, no duplicates)", async () => {
    const again = await preview(payload, { config: true });
    expect(again.status).toBe(200);
    for (const s of Object.values(again.body.sections)) {
      expect(s.willCreate).toBe(0);
      expect(s.willUpdate).toBe(0);
    }
    const res = await commit(payload, again.body.previewHash, { config: true });
    expect(res.status).toBe(200);
    expect(await listDocs("incidents")).toHaveLength(importable);
    expect(await listDocs("students")).toHaveLength(EXPECTED.students);
    expect(await weekDigestCount("THCS")).toBe(importable);
  });
});
