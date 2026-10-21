/**
 * RULES-11 regression: the entry form preview and the "Bổ sung học sinh" quick fix validate an edit with the same rule
 * context as the server's PATCH (resolveEditContext): kept class active, students already on the record valid as
 * ACTIVE with their *snapshot* class, catalog snapshot while the error is unchanged.
 */
import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { validateIncidentRules } from "@/lib/engine";
import { fixPreview } from "@/components/data-inspect/lib/review-queue";
import type { Incident } from "@/lib/types";
import { editRuleContext } from "../lib/edit-context";
import { formFromIncident } from "../lib/form-model";
import { computeEntryPreview } from "../lib/preview";

const ds = makeFixtureDataset();
const today = FIXTURE_TODAY;
const LONG = FIXTURE_STUDENT_IDS.long; // Vũ Hoàng Long, 6A02, TRANSFERRED_OUT since 2026-10-01
const longIncident = ds.incidents.find((i) => i.code === "NN-20260914-0002")!; // 6A02 · L01 · Cá nhân · [Long]

/** An imported 7A01 record naming a 7A02 student (STUDENT_WRONG_CLASS kept for review). */
const wrongClass: Incident = {
  ...ds.incidents.find((i) => i.classCode === "7A01" && i.errorCode === "L01" && i.students.length === 1)!,
  students: [{ id: FIXTURE_STUDENT_IDS.truongPhuc7A02, name: "Đinh Trường Phúc", classCode: "7A02" }],
  dataCheck: "REVIEW",
  dataIssues: [{ code: "STUDENT_WRONG_CLASS", message: "Đinh Trường Phúc thuộc lớp 7A02." }],
  source: "import",
};

describe("editRuleContext (server semantics)", () => {
  const args = { roster: ds.students, classes: ds.classes, catalog: ds.catalog, today };

  it("keeps students already on the record valid with their snapshot class", () => {
    const ctx = editRuleContext({ ...args, original: longIncident, classCode: "6A02", errorCode: "L01" });
    expect(ctx.studentsById.get(LONG)).toMatchObject({ classCode: "6A02", status: "ACTIVE" });
    expect(ctx.classInfo?.active).toBe(true);
    expect(ctx.catalogItem).toMatchObject({ code: "L01", penalty: longIncident.penalty, unit: longIncident.unit });

    const wrong = editRuleContext({ ...args, original: wrongClass, classCode: "7A01", errorCode: "L01" });
    expect(wrong.studentsById.get(FIXTURE_STUDENT_IDS.truongPhuc7A02)?.classCode).toBe("7A02");
  });

  it("uses the fresh roster for a create or a class change", () => {
    expect(editRuleContext({ ...args, classCode: "6A02", errorCode: "L01" }).studentsById.get(LONG)?.status).toBe("TRANSFERRED_OUT");
    const moved = editRuleContext({ ...args, original: longIncident, classCode: "6A01", errorCode: "L01" });
    expect(moved.studentsById.get(LONG)?.status).toBe("TRANSFERRED_OUT");
    const errors = validateIncidentRules({ date: longIncident.date, classCode: "6A01", errorCode: "L01", scope: "Cá nhân", studentIds: [LONG] }, moved);
    expect(errors.join(" ")).toContain("không thuộc lớp 6A01");
  });
});

describe("entry form preview", () => {
  it("rejects an edit of a STUDENT_WRONG_CLASS record like the server does (no 400 after submit)", () => {
    const preview = computeEntryPreview(ds, formFromIncident(wrongClass), today, wrongClass);
    expect(preview.canSave).toBe(false);
    expect(preview.issues).toContain("Đinh Trường Phúc (7A02) không thuộc lớp 7A01.");
  });

  it("still accepts editing a record whose student transferred since", () => {
    const preview = computeEntryPreview(ds, { ...formFromIncident(longIncident), detail: "Bổ sung mô tả" }, today, longIncident);
    expect(preview.issues).toEqual([]);
    expect(preview.canSave).toBe(true);
  });
});

describe("Bổ sung học sinh quick fix", () => {
  const ctx = { classes: ds.classes, students: ds.students, catalog: ds.catalog, today };

  it("lets the reviewer count unnamed students when a named one has transferred since", () => {
    const record: Incident = { ...longIncident, scope: "Tập thể", dataCheck: "THIEU_TEN_HS" };
    const preview = fixPreview(record, { studentIds: [LONG], unnamedCount: 2, scope: "Tập thể" }, ctx);
    expect(preview.errors).toEqual([]);
    expect(preview).toMatchObject({ namedCount: 1, unnamedCount: 2, dataCheck: "THIEU_TEN_HS" });
  });

  it("still refuses to add a student who is no longer studying", () => {
    const other = ds.incidents.find((i) => i.classCode === "6A02" && i.unit === "/HS" && !i.students.some((s) => s.id === LONG))!;
    const preview = fixPreview(other, { studentIds: [...other.students.map((s) => s.id), LONG], unnamedCount: 0, scope: other.scope }, ctx);
    expect(preview.errors).toContain("Vũ Hoàng Long không còn ở trạng thái Đang học.");
  });

  it("matches the entry form on STUDENT_WRONG_CLASS records", () => {
    const preview = fixPreview(wrongClass, { studentIds: wrongClass.students.map((s) => s.id), unnamedCount: 1, scope: "Tập thể" }, ctx);
    expect(preview.errors).toContain("Đinh Trường Phúc (7A02) không thuộc lớp 7A01.");
  });
});
