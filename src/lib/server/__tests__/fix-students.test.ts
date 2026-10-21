/**
 * Regression tests: chuyển cấp keeping the school-wide Mã HS (INTEGRITY-9) and the VN date of the UPDATE history
 * event (INTEGRITY-18).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as rosterCommitPOST } from "@/app/api/imports/students/commit/route";
import { POST as rosterPreviewPOST } from "@/app/api/imports/students/preview/route";
import { POST as wbCommitPOST } from "@/app/api/imports/workbook/commit/route";
import { POST as wbPreviewPOST } from "@/app/api/imports/workbook/preview/route";
import { POST as promotePOST } from "@/app/api/students/[id]/promote-level/route";
import type { ApiErrorBody, StudentImportPreview, StudentImportResult, WorkbookCommitResult, WorkbookPayload, WorkbookPreview } from "../../contract";
import { todayVN } from "../../engine/dates";
import type { AuditLog, Student, StudentLite } from "../../types";
import { updateStudent } from "../admin/students";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-fix-students";
const today = todayVN();
let admin = "";

const stu = async (level: string) => ((await getDoc<{ items: StudentLite[] }>("digests", `${level}__stu`))?.items ?? []).map((s) => s.id);

describe("students fixes", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("TH", {
      classes: ["5A1"],
      students: [
        { id: "HS100", name: "Lê Tốt Nghiệp", classCode: "5A1", status: "GRADUATED", leftAt: today },
        { id: "HS101", name: "Trần Còn Học", classCode: "5A1" },
        { id: "HS102", name: "Phạm Lên Cấp", classCode: "5A1", status: "GRADUATED", leftAt: today },
        { id: "HS103", name: "Vũ Sổ Cũ", classCode: "5A1", status: "GRADUATED", leftAt: today },
      ],
    });
    await seedReference("THCS", { classes: ["6A01", "6A02"] });
    admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
  });

  describe("INTEGRITY-9: chuyển cấp", () => {
    it("moves a TH graduate to THCS keeping Mã HS and history, in one transaction for both levels", async () => {
      const v = { TH: await readVersion("TH"), THCS: await readVersion("THCS") };
      const res = await callRoute<Student>(promotePOST, {
        method: "POST",
        url: "/api/students/HS100/promote-level",
        token: admin,
        params: { id: "HS100" },
        body: { toLevelId: "THCS", classCode: "6A01", date: today },
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: "HS100", levelId: "THCS", classCode: "6A01", grade: 6, status: "ACTIVE" });
      expect(res.body.leftAt).toBeUndefined();
      expect(res.body.history.at(-1)).toMatchObject({ type: "TRANSFER_IN", fromLevel: "TH", toLevel: "THCS", fromClass: "5A1", toClass: "6A01" });
      expect(await stu("TH")).not.toContain("HS100");
      expect(await stu("THCS")).toContain("HS100");
      expect(await readVersion("TH")).toBe(v.TH + 1);
      expect(await readVersion("THCS")).toBe(v.THCS + 1);
      const audit = (await listDocs<AuditLog>("auditLogs")).find((a) => a.action === "TRANSFER_STUDENT" && a.entityId === "HS100");
      expect(audit?.detail).toMatchObject({ promoteLevel: true, fromLevel: "TH", toLevel: "THCS" });

      const same = await callRoute<ApiErrorBody>(promotePOST, { method: "POST", url: "/api/students/HS100/promote-level", token: admin, params: { id: "HS100" }, body: { toLevelId: "THCS", classCode: "6A02", date: today } });
      expect(same.status).toBe(400);
      const thcsOnly = await createTestUser({ uid: "adm-thcs", role: "ADMIN", levels: ["THCS"] });
      const noAccess = await callRoute(promotePOST, { method: "POST", url: "/api/students/HS102/promote-level", token: thcsOnly.token, params: { id: "HS102" }, body: { toLevelId: "THCS", classCode: "6A01", date: today } });
      expect(noAccess.status).toBe(403);
    });

    it("the roster import offers chuyển cấp for students who left another level (still-studying ones stay INVALID)", async () => {
      const body = {
        levelId: "THCS",
        mode: "upsert",
        effectiveDate: today,
        rows: [
          { rowNumber: 2, id: "HS102", name: "Phạm Lên Cấp", classCode: "6A02" },
          { rowNumber: 3, id: "HS101", name: "Trần Còn Học", classCode: "6A02" },
        ],
      };
      const preview = await callRoute<StudentImportPreview>(rosterPreviewPOST, { method: "POST", url: "/api/imports/students/preview", token: admin, body });
      expect(preview.status).toBe(200);
      const byId = new Map(preview.body.rows.map((r) => [r.id, r]));
      expect(byId.get("HS102")).toMatchObject({ kind: "REINSTATE" });
      expect(byId.get("HS102")?.changes[0]).toContain("Chuyển cấp: Tiểu học lớp 5A1");
      expect(byId.get("HS101")?.kind).toBe("INVALID");
      const commit = await callRoute<StudentImportResult>(rosterCommitPOST, { method: "POST", url: "/api/imports/students/commit", token: admin, body: { ...body, previewHash: preview.body.previewHash } });
      expect(commit.status).toBe(200);
      expect(commit.body.reinstated).toBe(1);
      expect(await getDoc<Student>("students", "HS102")).toMatchObject({ levelId: "THCS", classCode: "6A02", status: "ACTIVE" });
      expect(await stu("TH")).not.toContain("HS102");
      expect(await stu("THCS")).toContain("HS102");
    });

    it("a workbook naming a student who left another level moves them (WARNING), not an ERROR", async () => {
      const payload: WorkbookPayload = {
        levelId: "THCS",
        sourceFileName: "thcs.xlsx",
        classes: [],
        catalog: [],
        weeks: [],
        students: [{ rowNumber: 5, id: "HS103", name: "Vũ Sổ Cũ", classCode: "6A01" }],
        incidents: [],
        links: [],
        rewards: [],
      };
      const preview = await callRoute<WorkbookPreview>(wbPreviewPOST, { method: "POST", url: "/api/imports/workbook/preview", token: admin, body: { payload } });
      expect(preview.body.sections.students).toMatchObject({ warning: 1, error: 0, willUpdate: 1 });
      expect(preview.body.issues[0].messages[0]).toContain("chuyển cấp");
      const commit = await callRoute<WorkbookCommitResult>(wbCommitPOST, { method: "POST", url: "/api/imports/workbook/commit", token: admin, body: { payload, previewHash: preview.body.previewHash } });
      expect(commit.status).toBe(200);
      const s = await getDoc<Student>("students", "HS103");
      expect(s).toMatchObject({ levelId: "THCS", classCode: "6A01", status: "ACTIVE" });
      expect(s?.history.at(-1)).toMatchObject({ type: "TRANSFER_IN", fromLevel: "TH" });
      expect(await stu("TH")).not.toContain("HS103");
    });
  });

  describe("INTEGRITY-18: history dates are VN calendar dates", () => {
    it("the UPDATE event uses the VN day of the request, not the UTC date of the timestamp", async () => {
      const user = { uid: "admin", email: "admin@nshm.test", profile: (await getDoc("users", "admin")) as never };
      const after = await updateStudent({ user, today: "2026-10-22" }, "HS101", { note: "Sửa lúc 06:30 sáng" });
      expect(after.history.at(-1)).toMatchObject({ type: "UPDATE", date: "2026-10-22" });
    });
  });
});
