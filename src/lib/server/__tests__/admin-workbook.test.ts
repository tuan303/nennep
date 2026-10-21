import { beforeAll, describe, expect, it } from "vitest";
import { POST as commitPOST } from "@/app/api/imports/workbook/commit/route";
import { POST as previewPOST } from "@/app/api/imports/workbook/preview/route";
import { GET as datasetGET } from "@/app/api/dataset/route";
import type { ApiErrorBody, WorkbookCommitResult, WorkbookPayload, WorkbookPreview } from "../../contract";
import { addDays, todayVN } from "../../engine/dates";
import { hasSeed, readSeed } from "../../excel/__tests__/fixtures";
import { parseNshmWorkbook } from "../../excel/parse-workbook";
import type { AuditLog, Incident, LevelDataset, Reward, Student } from "../../types";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-admin-workbook";
const today = todayVN();
let admin = "";
let editor = "";

async function preview(payload: WorkbookPayload, options: Record<string, boolean> = {}, token = admin) {
  return callRoute<WorkbookPreview & ApiErrorBody>(previewPOST, { method: "POST", url: "/api/imports/workbook/preview", token, body: { payload, options } });
}
async function commit(payload: WorkbookPayload, previewHash: string, options: Record<string, boolean> = {}) {
  return callRoute<WorkbookCommitResult & ApiErrorBody>(commitPOST, { method: "POST", url: "/api/imports/workbook/commit", token: admin, body: { payload, options, previewHash } });
}
async function weekDigestCount(levelId: string): Promise<number> {
  const docs = await listDocs<{ levelId: string; kind: string; items: Incident[] }>("digests");
  return docs.filter((d) => d.levelId === levelId && d.kind === "inc").reduce((n, d) => n + d.items.length, 0);
}

describe("workbook import", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    admin = (await createTestUser({ uid: "admin", role: "ADMIN", displayName: "Quản trị" })).token;
    editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
  });

  it("requires excel.import", async () => {
    const res = await preview({ levelId: "TH", sourceFileName: "x.xlsx", classes: [], catalog: [], weeks: [], students: [], incidents: [], links: [], rewards: [] }, {}, editor);
    expect(res.status).toBe(403);
  });

  // Real seed workbook (personal data, git-ignored): developer machines only, counts and shapes only – never a real
  // value in this file. The synthetic variant that runs everywhere is admin-workbook-legacy.test.ts.
  describe.skipIf(!hasSeed())("AC-016: THCS legacy workbook end-to-end (real seed)", () => {
    let payload: WorkbookPayload;
    let first: WorkbookPreview;

    beforeAll(async () => {
      payload = (await parseNshmWorkbook(new Uint8Array(readSeed("THCS")), "THCS.xlsx")).payload;
    });

    it("preview validates every section and writes nothing", async () => {
      const res = await preview(payload, { config: true });
      expect(res.status).toBe(200);
      first = res.body;
      const s = first.sections;
      expect(s.classes).toMatchObject({ total: 50, willCreate: 50, error: 0 });
      expect(s.catalog).toMatchObject({ total: 43, willCreate: 43, error: 0 });
      expect(s.config).toMatchObject({ total: 1, willCreate: 1 });
      expect(s.weeks).toMatchObject({ total: 42, willCreate: 42 });
      expect(s.students).toMatchObject({ total: 1647, willCreate: 1647, error: 0 });
      expect(s.incidents).toMatchObject({ total: 154, error: 0, willCreate: 154 });
      expect(s.links.total).toBe(44);
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
      expect(res.body.created).toMatchObject({ classes: 50, catalog: 43, weeks: 42, students: 1647, incidents: 154 });
      expect(res.body.review).toBeGreaterThan(0);

      const incidents = await listDocs<Incident>("incidents");
      expect(incidents).toHaveLength(154);
      const first0 = incidents.find((i) => i.code === "NN-20260923-0001");
      expect(first0).toMatchObject({ classCode: "9I0", errorCode: "L43", source: "import", externalId: "NN-20260923-0001", importBatchId: res.body.batchId });
      const linkedIds = payload.links.filter((l) => l.incidentCode === "NN-20260923-0001").map((l) => l.studentId);
      expect(linkedIds).toHaveLength(1);
      expect(first0?.students.map((s) => s.id)).toEqual(linkedIds);
      expect(incidents.filter((i) => i.dataCheck === "REVIEW")).toHaveLength(res.body.review);
      expect((await listDocs<Student>("students")).length).toBe(1647);

      const stu = await getDoc<{ items: unknown[] }>("digests", "THCS__stu");
      expect(stu?.items).toHaveLength(1647);
      expect(await weekDigestCount("THCS")).toBe(154);
      expect((await getDoc<{ seq: number }>("counters", "NN_THCS_20260923"))?.seq).toBeGreaterThanOrEqual(1);

      const ds = await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: admin });
      expect(ds.status).toBe(200);
      expect(ds.body.incidents).toHaveLength(154);
      expect(ds.body.students).toHaveLength(1647);
      expect(ds.body.classes).toHaveLength(50);
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
      expect(await listDocs("incidents")).toHaveLength(154);
      expect(await listDocs("students")).toHaveLength(1647);
      expect(await weekDigestCount("THCS")).toBe(154);
    });
  });

  describe("AC-017 and row rules on a small TH workbook", () => {
    const d1 = addDays(today, -3);
    const d2 = addDays(today, -2);
    const compact = (d: string) => d.replaceAll("-", "");
    const base = (): WorkbookPayload => ({
      levelId: "TH",
      sourceFileName: "nho.xlsx",
      classes: [],
      catalog: [],
      weeks: [],
      students: [
        { rowNumber: 5, id: "T1", name: "Nguyễn An", classCode: "1A1" },
        { rowNumber: 6, id: "T2", name: "Lê Bình", classCode: "1A2" },
        { rowNumber: 7, id: "T3", name: "Trần Chi", classCode: "1A1", statusText: "Chuyển đến HKI" },
      ],
      incidents: [
        { rowNumber: 5, code: `NN-${compact(d1)}-0007`, date: d1, classCode: "1A1", errorCode: "L01", pointsInFile: 6, status: "Đã giao", legacyCheckText: "Kim Khánh" },
        { rowNumber: 6, code: `NN-${compact(d1)}-0008`, date: d1, classCode: "9Z99", errorCode: "L01" },
        { rowNumber: 7, code: `NN-${compact(d2)}-0001`, date: d2, classCode: "1A1", errorCode: "L02", occurrenceCount: 2, scope: "Tập thể", status: "Đã đóng" },
        { rowNumber: 8, code: "", date: d2, classCode: "1A2", errorCode: "L02" },
        { rowNumber: 9, code: `NN-${compact(d2)}-0002`, date: "", classCode: "1A1", errorCode: "L01" },
        { rowNumber: 10, code: `NN-${compact(d2)}-0003`, date: d2, classCode: "1A1", errorCode: "L99" },
      ],
      links: [
        { rowNumber: 5, incidentCode: `NN-${compact(d1)}-0007`, studentId: "T1", studentName: "Nguyễn An" },
        { rowNumber: 6, incidentCode: `NN-${compact(d1)}-0007`, studentId: "T2" },
        { rowNumber: 7, incidentCode: `NN-${compact(d1)}-0007`, studentName: "trần chi" },
        { rowNumber: 8, incidentCode: `NN-${compact(d1)}-0007`, studentId: "NOPE", studentName: "Không Có" },
        { rowNumber: 9, incidentCode: `NN-${compact(d1)}-0007`, studentId: "T1" },
        { rowNumber: 10, incidentCode: "NN-20200101-0001", studentId: "T1" },
      ],
      rewards: [
        { rowNumber: 5, code: `KT-${compact(d1)}-0004`, date: d1, classCode: "1A1", reason: "Lớp sạch đẹp", points: 5, status: "Đã xác nhận" },
        { rowNumber: 6, code: "", date: d2, classCode: "1A2", reason: "Văn nghệ", points: 3 },
        { rowNumber: 7, code: "", date: d2, classCode: "1A9", reason: "Lớp lạ", points: 3 },
      ],
    });

    beforeAll(async () => {
      await seedReference("TH", { classes: ["1A1", "1A2"] });
    });

    it("unknown class / date / error code rows are ERROR and never committed; links and data checks are flagged", async () => {
      const payload = base();
      const res = await preview(payload);
      expect(res.status).toBe(200);
      const s = res.body.sections;
      expect(s.incidents).toMatchObject({ total: 6, error: 3, willCreate: 3, willSkip: 3 });
      const err = (row: number) => res.body.issues.find((i) => i.sheet === "Nhập liệu" && i.rowNumber === row);
      expect(err(6)).toMatchObject({ severity: "ERROR" });
      expect(err(6)?.messages).toContain("Lớp 9Z99 không có trong danh mục lớp.");
      expect(err(9)?.messages).toContain("Thiếu ngày ghi nhận.");
      expect(err(10)?.messages).toContain("Mã lỗi L99 không có trong bảng điểm lỗi.");
      expect(s.links).toMatchObject({ total: 6, error: 2 });
      expect(s.rewards).toMatchObject({ total: 3, error: 1, willCreate: 2 });

      const done = await commit(payload, res.body.previewHash);
      expect(done.status).toBe(200);
      const incidents = (await listDocs<Incident>("incidents")).filter((i) => i.levelId === "TH");
      expect(incidents).toHaveLength(3);
      expect(incidents.some((i) => i.classCode === "9Z99")).toBe(false);

      const main = incidents.find((i) => i.code === `NN-${compact(d1)}-0007`);
      expect(main?.students.map((x) => x.id)).toEqual(["T1", "T2", "T3"]);
      expect(main?.students.find((x) => x.id === "T2")?.classCode).toBe("1A2");
      expect(main).toMatchObject({ scope: "Cá nhân", status: "Đang xử lý", points: 6, relatedStudentCount: 3, dataCheck: "REVIEW", unnamedCount: 0 });
      const codes = main?.dataIssues.map((d) => d.code).sort();
      expect(codes).toEqual(["DUPLICATE_STUDENT", "LEGACY_NOTE", "SCOPE_MISSING", "STUDENT_NOT_FOUND", "STUDENT_WRONG_CLASS"]);
      expect(main?.dataIssues.find((d) => d.code === "LEGACY_NOTE")?.message).toBe("Ghi chú trong file cũ: Kim Khánh");

      const collective = incidents.find((i) => i.code === `NN-${compact(d2)}-0001`);
      expect(collective).toMatchObject({ points: 10, status: "Đã đóng", dataCheck: "OK", occurrenceCount: 2 });
      const generated = incidents.find((i) => i.classCode === "1A2");
      expect(generated?.code).toBe(`NN-${compact(d2)}-0002`);
      expect((await getDoc<{ seq: number }>("counters", `NN_TH_${compact(d1)}`))?.seq).toBe(7);
      expect((await getDoc<{ seq: number }>("counters", `NN_TH_${compact(d2)}`))?.seq).toBe(2);

      const rewards = (await listDocs<Reward>("rewards")).filter((r) => r.levelId === "TH");
      expect(rewards.map((r) => r.code).sort()).toEqual([`KT-${compact(d1)}-0004`, `KT-${compact(d2)}-0001`]);
      expect(rewards.find((r) => r.classCode === "1A1")?.status).toBe("Đã xác nhận");

      const t3 = await getDoc<Student>("students", "T3");
      expect(t3).toMatchObject({ status: "ACTIVE", classCode: "1A1", note: "Chuyển đến HKI" });
      expect(t3?.history[0]).toMatchObject({ type: "IMPORT", toClass: "1A1", by: "admin@nshm.test" });
    });

    it("updates existing records but keeps soft-deleted ones untouched", async () => {
      const code = `NN-${compact(d2)}-0001`;
      const id = `TH_${code}`;
      const before = await getDoc<Incident>("incidents", id);
      const payload = base();
      payload.incidents = payload.incidents.map((i) => (i.code === code ? { ...i, detail: "Bổ sung chi tiết" } : i));
      const p1 = await preview(payload);
      expect(p1.body.sections.incidents.willUpdate).toBe(1);
      expect(p1.body.sections.incidents.willCreate).toBe(1); // the code-less row gets a new code again
      const c1 = await commit(payload, p1.body.previewHash);
      expect(c1.status).toBe(200);
      const after = await getDoc<Incident>("incidents", id);
      expect(after?.detail).toBe("Bổ sung chi tiết");
      expect(after?.createdAt).toBe(before?.createdAt);
      expect(after?.updatedBy).toBe("admin@nshm.test");
    });
  });
});
