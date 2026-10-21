import { beforeAll, describe, expect, it } from "vitest";
import { POST as commitPOST } from "@/app/api/imports/students/commit/route";
import { POST as previewPOST } from "@/app/api/imports/students/preview/route";
import type { ApiErrorBody, RosterRow, StudentImportPreview, StudentImportResult } from "../../contract";
import { todayVN } from "../../engine/dates";
import type { AuditLog, Student, StudentLite } from "../../types";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-admin-roster";
const today = todayVN();
let admin = "";
let editor = "";

const rows: RosterRow[] = [
  { rowNumber: 2, id: "R1", name: "Nguyễn An", classCode: "6A01" }, // UNCHANGED
  { rowNumber: 3, id: "R2", name: "Lê Bình Minh", classCode: "6a01", dob: "2014-01-02" }, // UPDATE (name + dob)
  { rowNumber: 4, id: "R6", name: "Phạm Dũng", classCode: "6A02", statusText: "Chuyển đến HKI" }, // NEW
  { rowNumber: 5, id: "R3", name: "Trần Chi", classCode: "6A01" }, // REINSTATE (was TRANSFERRED_OUT in 6A02)
  { rowNumber: 6, id: "R1", name: "Nguyễn An", classCode: "6A01" }, // INVALID duplicate
  { rowNumber: 7, id: "", name: "Không Mã", classCode: "6A01" }, // INVALID no id
  { rowNumber: 8, id: "R7", name: "Lớp Lạ", classCode: "9Z9" }, // INVALID class
  { rowNumber: 9, id: "P9", name: "Cấp Khác", classCode: "6A01" }, // INVALID other level
  { rowNumber: 10, id: "R8", name: "Lớp Nghỉ", classCode: "6A03" }, // INVALID inactive class
  { rowNumber: 11, id: "R4", name: "Hoàng Em", classCode: "6A01" }, // TRANSFER 6A02 → 6A01
];

const body = (extra: Record<string, unknown> = {}) => ({ levelId: "THCS", mode: "sync", effectiveDate: today, rows, ...extra });
const preview = (token = admin) => callRoute<StudentImportPreview & ApiErrorBody>(previewPOST, { method: "POST", url: "/api/imports/students/preview", token, body: body() });
const commit = (extra: Record<string, unknown>) =>
  callRoute<StudentImportResult & ApiErrorBody>(commitPOST, { method: "POST", url: "/api/imports/students/commit", token: admin, body: body(extra) });

describe("student roster import", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", {
      classes: ["6A01", "6A02", { code: "6A03", active: false }],
      students: [
        { id: "R1", name: "Nguyễn An", classCode: "6A01" },
        { id: "R2", name: "Lê Bình", classCode: "6A01" },
        { id: "R3", name: "Trần Chi", classCode: "6A02", status: "TRANSFERRED_OUT", leftAt: "2026-09-01", leftReason: "Chuyển đi" },
        { id: "R4", name: "Hoàng Em", classCode: "6A02" },
        { id: "R5", name: "Vũ Giang", classCode: "6A02" },
      ],
    });
    await seedReference("THPT", { classes: ["10A1"], students: [{ id: "P9", name: "Cấp Khác", classCode: "10A1" }] });
    admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
  });

  it("requires students.manage", async () => {
    expect((await preview(editor)).status).toBe(403);
  });

  it("preview classifies rows, lists missing ACTIVE students (sync) and writes nothing", async () => {
    const v0 = await readVersion("THCS");
    const res = await preview();
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ NEW: 1, UPDATE: 1, TRANSFER: 1, REINSTATE: 1, UNCHANGED: 1, INVALID: 5, total: 10, missing: 1 });
    expect(res.body.missing.map((s) => s.id)).toEqual(["R5"]);
    const byRow = new Map(res.body.rows.map((r) => [r.rowNumber, r]));
    expect(byRow.get(3)?.changes).toEqual(["Họ tên: Lê Bình → Lê Bình Minh", "Ngày sinh: (trống) → 02/01/2014"]);
    expect(byRow.get(3)?.classCode).toBe("6A01");
    expect(byRow.get(5)?.changes[0]).toBe("Trạng thái: Đã chuyển trường → Đang học");
    expect(byRow.get(5)?.changes).toContain("Lớp: 6A02 → 6A01");
    expect(byRow.get(6)?.errors[0]).toBe("Mã HS R1 bị trùng với dòng 2.");
    expect(byRow.get(7)?.errors).toContain("Thiếu mã HS.");
    expect(byRow.get(8)?.errors).toContain("Lớp 9Z9 không có trong danh mục lớp.");
    expect(byRow.get(9)?.errors[0]).toContain("đang học ở cấp THPT (lớp 10A1)");
    expect(byRow.get(10)?.errors).toContain("Lớp 6A03 đã ngừng hoạt động.");
    expect(byRow.get(11)).toMatchObject({ kind: "TRANSFER", changes: ["Lớp: 6A02 → 6A01"] });
    expect(await readVersion("THCS")).toBe(v0);
    expect(await getDoc("students", "R6")).toBeUndefined();
  });

  it("commit rejects a wrong previewHash with 409", async () => {
    const res = await commit({ previewHash: "deadbeefdeadbeef", applyMissingAsWithdrawn: true });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe("Dữ liệu đã thay đổi, vui lòng xem trước lại");
  });

  it("commit applies every kind, withdraws missing students and rebuilds the digest", async () => {
    const p = await preview();
    const v0 = await readVersion("THCS");
    const res = await commit({ previewHash: p.body.previewHash, applyMissingAsWithdrawn: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 1, updated: 1, transferred: 1, reinstated: 1, withdrawn: 1, skipped: 6 });

    const r6 = await getDoc<Student>("students", "R6");
    expect(r6).toMatchObject({ status: "ACTIVE", classCode: "6A02", grade: 6, note: "Chuyển đến HKI", enrolledAt: today });
    expect(r6?.history[0]).toMatchObject({ type: "IMPORT", toClass: "6A02" });
    expect(await getDoc<Student>("students", "R2")).toMatchObject({ name: "Lê Bình Minh", dob: "2014-01-02" });
    const r3 = await getDoc<Student>("students", "R3");
    expect(r3).toMatchObject({ status: "ACTIVE", classCode: "6A01" });
    expect(r3?.leftAt).toBeUndefined();
    expect(r3?.history.at(-1)).toMatchObject({ type: "REINSTATE", fromClass: "6A02", toClass: "6A01" });
    expect((await getDoc<Student>("students", "R4"))?.history.at(-1)).toMatchObject({ type: "TRANSFER_CLASS", fromClass: "6A02", toClass: "6A01" });
    const r5 = await getDoc<Student>("students", "R5");
    expect(r5).toMatchObject({ status: "TRANSFERRED_OUT", leftAt: today, leftReason: "Không có trong danh sách import" });
    expect(r5?.history.at(-1)).toMatchObject({ type: "TRANSFER_OUT", fromClass: "6A02" });
    expect(await getDoc("students", "R7")).toBeUndefined();
    expect((await getDoc<Student>("students", "P9"))?.levelId).toBe("THPT");

    const digest = (await getDoc<{ items: StudentLite[] }>("digests", "THCS__stu"))?.items ?? [];
    expect(digest).toHaveLength(6);
    expect(digest.find((s) => s.id === "R5")?.status).toBe("TRANSFERRED_OUT");
    expect(digest.find((s) => s.id === "R6")?.classCode).toBe("6A02");
    expect(await readVersion("THCS")).toBe(v0 + 1);
    const audit = (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "IMPORT_STUDENTS");
    expect(audit).toHaveLength(1);
    expect(audit[0].detail).toMatchObject({ created: 1, withdrawn: 1, mode: "sync" });

    // Same file again: the previous hash is stale, a new preview shows nothing left to do except invalid rows.
    expect((await commit({ previewHash: p.body.previewHash })).status).toBe(409);
    const again = await preview();
    expect(again.body.summary).toMatchObject({ NEW: 0, UPDATE: 0, TRANSFER: 0, REINSTATE: 0, UNCHANGED: 5, INVALID: 5, missing: 0 });
  });
});
