/** REQ_V2 §7.1 "Đợt kiểm tra": form model, class selection, validation mirroring the server, payloads, rights, list. */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import { V2_CATEGORIES, V2_INSPECTION_IDS, makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import { InspectionCreateSchema, InspectionUpdateSchema } from "@/lib/contract";
import type { Inspection, UserProfile } from "@/lib/types";
import { ClassMultiSelect } from "../class-multi-select";
import { InspectionRow } from "../inspection-list";
import {
  INSPECTION_MSG,
  canEditInspection,
  gradeSelectionState,
  inspectionCategories,
  inspectionDayStats,
  inspectionFormDirty,
  inspectionFormFromRecord,
  inspectionScopeLabel,
  inspectionSummary,
  isInspectionPatchEmpty,
  newInspectionForm,
  nextInspectionForm,
  orderClassCodes,
  recentInspections,
  selectableClassGroups,
  setAllSelected,
  setGradeSelected,
  shiftForTime,
  toInspectionCreateInput,
  toInspectionUpdateInput,
  toggleClass,
  validateInspectionForm,
  type InspectionForm,
} from "../lib/inspection-form";

const ds = makeV2FixtureDataset();
const today = FIXTURE_TODAY;
const HOUR = 3_600_000;
const byId = (id: string): Inspection => {
  const r = (ds.inspections ?? []).find((x) => x.id === id);
  if (!r) throw new Error(`fixture inspection ${id} missing`);
  return r;
};
const valid = (patch: Partial<InspectionForm> = {}): InspectionForm => ({ ...newInspectionForm({ today, inspector: "Cô Mẫu", shift: "Sáng" }), classCodes: ["6A01", "6A02"], ...patch });

function profile(role: UserProfile["role"], uid = "uid-editor-thcs"): UserProfile {
  return { uid, email: `${uid}@x.vn`, displayName: "X", role, levels: [], gvcnClasses: [], active: true, createdAt: "2026-08-01T00:00:00.000Z" };
}

describe("form state", () => {
  it("picks the buổi from the Vietnamese time of day", () => {
    expect(shiftForTime(Date.parse("2026-10-21T01:00:00Z"))).toBe("Sáng"); // 08:00 VN
    expect(shiftForTime(Date.parse("2026-10-21T04:59:00Z"))).toBe("Sáng"); // 11:59 VN
    expect(shiftForTime(Date.parse("2026-10-21T05:00:00Z"))).toBe("Chiều"); // 12:00 VN
    expect(shiftForTime(Date.parse("2026-10-20T20:00:00Z"))).toBe("Sáng"); // 03:00 next day VN
  });

  it("starts empty, keeps day / buổi / inspector after saving and detects changes", () => {
    const f = newInspectionForm({ today, inspector: "Cô Mẫu" });
    expect(f).toEqual({ date: today, shift: "", category: "", classCodes: [], inspector: "Cô Mẫu", note: "" });
    const next = nextInspectionForm(valid({ category: V2_CATEGORIES.cc, note: "x" }));
    expect(next).toMatchObject({ date: today, shift: "Sáng", inspector: "Cô Mẫu", category: "", classCodes: [], note: "" });
    expect(inspectionFormDirty(valid(), valid({ classCodes: ["6A02", "6A01"] }))).toBe(false);
    expect(inspectionFormDirty(valid(), valid({ note: "  " }))).toBe(false);
    expect(inspectionFormDirty(valid(), valid({ classCodes: ["6A01"] }))).toBe(true);
  });

  it("prefills from a stored round", () => {
    const r = byId(V2_INSPECTION_IDS.general1019);
    expect(inspectionFormFromRecord(r)).toMatchObject({ date: r.date, shift: "", category: "", classCodes: r.classCodes });
    expect(inspectionFormFromRecord(byId(V2_INSPECTION_IDS.cc0914))).toMatchObject({ shift: "Chiều", category: V2_CATEGORIES.cc });
  });
});

describe("class selection", () => {
  const groups = selectableClassGroups(ds.classes);

  it("groups active classes by grade in display order (inactive kept only when on the record)", () => {
    expect(groups.map((g) => g.label)).toEqual(["Khối 6", "Khối 7"]);
    const all = groups.flatMap((g) => g.classes.map((c) => c.code));
    expect(all).not.toContain("7A04");
    expect(selectableClassGroups(ds.classes, ["7A04"]).flatMap((g) => g.classes.map((c) => c.code))).toContain("7A04");
  });

  it("toggles classes, whole grades and everything", () => {
    const g6 = groups[0];
    expect(toggleClass(["6A01"], "6A01")).toEqual([]);
    expect(toggleClass(["6A01"], "6A02")).toEqual(["6A01", "6A02"]);
    expect(gradeSelectionState([], g6)).toBe("none");
    expect(gradeSelectionState(["6A01"], g6)).toBe("some");
    const whole = setGradeSelected(["7A01"], g6, true);
    expect(gradeSelectionState(whole, g6)).toBe("all");
    expect(whole).toContain("7A01");
    expect(setGradeSelected(whole, g6, false)).toEqual(["7A01"]);
    expect(setAllSelected(groups, true)).toHaveLength(groups.reduce((n, g) => n + g.classes.length, 0));
    expect(setAllSelected(groups, false)).toEqual([]);
  });

  it("orders codes like the class list", () => {
    expect(orderClassCodes(["7A01", "6A02", "6A01", "6A02"], ds.classes)).toEqual(["6A01", "6A02", "7A01"]);
    expect(orderClassCodes(["ZZ", "6A01"], ds.classes)).toEqual(["6A01", "ZZ"]);
  });

  it("lists the catalog Mảng once each, plus a kept one", () => {
    const cats = inspectionCategories(ds.catalog);
    expect(cats).toEqual(expect.arrayContaining(Object.values(V2_CATEGORIES)));
    expect(new Set(cats).size).toBe(cats.length);
    expect(inspectionCategories(ds.catalog, "Mảng cũ")).toContain("Mảng cũ");
  });
});

describe("validation (mirrors the server)", () => {
  it("accepts a complete round", () => {
    expect(validateInspectionForm(valid(), ds, today)).toEqual([]);
    expect(validateInspectionForm(valid({ category: V2_CATEGORIES.bt }), ds, today)).toEqual([]);
  });

  it("refuses missing / future / out-of-calendar dates, no class, unknown or inactive classes and unknown Mảng", () => {
    expect(validateInspectionForm(valid({ date: "" }), ds, today)).toEqual([INSPECTION_MSG.noDate]);
    expect(validateInspectionForm(valid({ date: "2026-10-22" }), ds, today)).toEqual([INSPECTION_MSG.futureDate]);
    expect(validateInspectionForm(valid({ date: "2025-05-12" }), ds, today)).toEqual(["Ngày 12/05/2025 không thuộc lịch tuần của năm học (Cài đặt → Lịch tuần)."]);
    expect(validateInspectionForm(valid({ classCodes: [] }), ds, today)).toEqual([INSPECTION_MSG.noClasses]);
    expect(validateInspectionForm(valid({ classCodes: ["9Z99"] }), ds, today)).toEqual([INSPECTION_MSG.unknownClass("9Z99")]);
    expect(validateInspectionForm(valid({ classCodes: ["7A04"] }), ds, today)).toEqual([INSPECTION_MSG.inactiveClass("7A04")]);
    expect(validateInspectionForm(valid({ category: "Mảng lạ" }), ds, today)).toEqual([INSPECTION_MSG.unknownCategory("Mảng lạ")]);
  });

  it("on edit, the stored date / classes / Mảng stay valid", () => {
    const original = { date: "2025-05-12", classCodes: ["7A04"], category: "Mảng cũ" };
    expect(validateInspectionForm(valid({ date: "2025-05-12", classCodes: ["7A04"], category: "Mảng cũ" }), ds, today, original)).toEqual([]);
  });
});

describe("payloads", () => {
  it("create: ordered classes, empty buổi / Mảng / inspector / note omitted – valid for the contract", () => {
    const input = toInspectionCreateInput("THCS", valid({ classCodes: ["7A01", "6A01"], inspector: " ", note: " ", shift: "" }), ds.classes);
    expect(input).toEqual({ levelId: "THCS", date: today, classCodes: ["6A01", "7A01"] });
    const full = toInspectionCreateInput("THCS", valid({ category: V2_CATEGORIES.cc, note: " Đột xuất " }), ds.classes);
    expect(full).toEqual({ levelId: "THCS", date: today, shift: "Sáng", category: V2_CATEGORIES.cc, classCodes: ["6A01", "6A02"], inspector: "Cô Mẫu", note: "Đột xuất" });
    expect(InspectionCreateSchema.safeParse({ ...full, clientRequestId: "abcdefgh12" }).success).toBe(true);
  });

  it("update: only changed fields + baseRev; '' clears buổi / Mảng / note", () => {
    const r: Inspection = { ...byId(V2_INSPECTION_IDS.cc0914), rev: 3, note: "Ghi chú" };
    const same = toInspectionUpdateInput(inspectionFormFromRecord(r), r, ds.classes);
    expect(same).toEqual({ baseRev: 3 });
    expect(isInspectionPatchEmpty(same)).toBe(true);
    const changed = toInspectionUpdateInput({ ...inspectionFormFromRecord(r), shift: "", category: "", note: "", classCodes: [...r.classCodes].reverse().concat("7A03") }, r, ds.classes);
    expect(changed).toEqual({ baseRev: 3, shift: "", category: "", note: "", classCodes: orderClassCodes([...r.classCodes, "7A03"], ds.classes) });
    expect(isInspectionPatchEmpty(changed)).toBe(false);
    expect(InspectionUpdateSchema.safeParse(changed).success).toBe(true);
    expect(toInspectionUpdateInput({ ...inspectionFormFromRecord(r), classCodes: [...r.classCodes].reverse() }, { ...r, rev: undefined }, ds.classes)).toEqual({ baseRev: 0 });
  });
});

describe("rights and recent list", () => {
  const r = byId(V2_INSPECTION_IDS.general1019);
  const created = Date.parse(r.createdAt);

  it("ADMIN edits any round; EDITOR own rounds within 24 h; others never", () => {
    const own = { ...r, createdBy: "uid-editor-thcs" };
    expect(canEditInspection(profile("ADMIN", "a"), r, created + 900 * HOUR)).toBe(true);
    expect(canEditInspection(profile("EDITOR"), own, created + 2 * HOUR)).toBe(true);
    expect(canEditInspection(profile("EDITOR"), own, created + 25 * HOUR)).toBe(false);
    expect(canEditInspection(profile("EDITOR", "other"), own, created + HOUR)).toBe(false);
    expect(canEditInspection(profile("VIEWER"), own, created)).toBe(false);
    expect(canEditInspection(profile("GVCN"), own, created)).toBe(false);
    expect(canEditInspection(profile("ADMIN"), { ...own, deletedAt: "x" }, created)).toBe(false);
  });

  it("lists the last 30 days newest first, without deleted rounds", () => {
    const rows = recentInspections(ds.inspections, today);
    expect(rows.every((x) => !x.deletedAt && x.date >= "2026-09-22" && x.date <= today)).toBe(true);
    expect(rows.map((x) => x.id)).not.toContain(V2_INSPECTION_IDS.deleted1020);
    expect(rows.map((x) => x.id)).toContain(V2_INSPECTION_IDS.general1019);
    for (let k = 1; k < rows.length; k++) expect(rows[k - 1].date >= rows[k].date).toBe(true);
    expect(rows.map((x) => x.id).slice(0, 3)).toEqual([V2_INSPECTION_IDS.general1019, V2_INSPECTION_IDS.cc1012, V2_INSPECTION_IDS.khac1012]);
    expect(recentInspections(undefined, today)).toEqual([]);
  });

  it("labels rounds", () => {
    expect(inspectionScopeLabel(r)).toBe("Kiểm tra chung");
    expect(inspectionSummary(byId(V2_INSPECTION_IDS.cc0914))).toBe(`14/09/2026 · Chiều · 6 lớp · ${V2_CATEGORIES.cc}`);
    expect(inspectionDayStats(ds.inspections, "2026-10-12")).toEqual({ rounds: 2, classes: 6 });
    expect(inspectionDayStats(ds.inspections, today)).toEqual({ rounds: 0, classes: 0 });
  });
});

describe("render", () => {
  it("class grid: counter, 'Chọn cả khối' and pressed state", () => {
    const html = renderToStaticMarkup(h(ClassMultiSelect, { classes: ds.classes, value: ["6A01", "6A02"], onChange: () => undefined }));
    expect(html).toContain("Chọn cả khối");
    expect(html).toContain("Chọn tất cả");
    expect(html).toMatch(/Đã chọn <strong[^>]*>2<\/strong>\/\d+ lớp/);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Khối 7");
  });

  it("recent row: Mảng, buổi, code, classes button and actions", () => {
    const row = byId(V2_INSPECTION_IDS.cc0914);
    const html = renderToStaticMarkup(h(InspectionRow, { inspection: row, highlighted: false, canEdit: true, onEdit: () => undefined, onDelete: () => undefined }));
    expect(html).toContain(V2_CATEGORIES.cc);
    expect(html).toContain("Chiều");
    expect(html).toContain(row.code);
    expect(html).toContain("6 lớp");
    expect(html).toContain(`Sửa đợt kiểm tra ${row.code}`);
    const readOnly = renderToStaticMarkup(h(InspectionRow, { inspection: row, highlighted: false, canEdit: false, onEdit: () => undefined, onDelete: () => undefined }));
    expect(readOnly).not.toContain("Sửa đợt kiểm tra");
  });
});
