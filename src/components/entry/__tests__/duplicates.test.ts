/** REQ_V2 §7.1: duplicate warning of the entry form, "Không trùng, vẫn lưu" payload and the Sự việc | Đợt kiểm tra tabs. */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import { V2_FIXTURE_IDS, makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import { IncidentCreateSchema } from "@/lib/contract";
import type { Incident } from "@/lib/types";
import { EntryActionBar } from "../action-bar";
import { DuplicateNotice } from "../duplicate-parts";
import {
  duplicateLabel,
  duplicateNoticeText,
  entryDuplicateDraft,
  entryDuplicates,
  notDuplicateIds,
  recordedAtText,
  recorderOf,
  withNotDuplicate,
} from "../lib/duplicates";
import { entryTabQuery, entryTabsFor, resolveEntryTab } from "../lib/entry-tabs";
import { formFromIncident, newEntryForm, type EntryForm } from "../lib/form-model";
import { toIncidentCreateInput } from "../lib/payload";
import { computeEntryPreview } from "../lib/preview";
import { rosterNames } from "../lib/student-names";

const ds = makeV2FixtureDataset();
const today = FIXTURE_TODAY;
const byId = (id: string): Incident => {
  const found = ds.incidents.find((i) => i.id === id);
  if (!found) throw new Error(`fixture incident ${id} missing`);
  return found;
};
const named = byId(V2_FIXTURE_IDS.dupNamedOf); // 6A01 · 20/10 · L01 · one named student
const form = (patch: Partial<EntryForm>): EntryForm => ({ ...newEntryForm({ today }), ...patch });
const roster = rosterNames(ds.students);

describe("entry duplicate check", () => {
  it("matches same date + class + error + student, newest first", () => {
    const f = form({ date: named.date, classCode: named.classCode, errorCode: named.errorCode, studentIds: [named.students[0].id] });
    const found = entryDuplicates(ds.incidents, f);
    expect(found.map((i) => i.id)).toEqual(expect.arrayContaining([V2_FIXTURE_IDS.dupNamedOf, V2_FIXTURE_IDS.dupNamed]));
    for (let k = 1; k < found.length; k++) expect(found[k - 1].createdAt >= found[k].createdAt).toBe(true);
  });

  it("needs date, class and error; other students or another error do not match", () => {
    expect(entryDuplicates(ds.incidents, form({ classCode: named.classCode, errorCode: named.errorCode, date: "" }))).toEqual([]);
    expect(entryDuplicates(ds.incidents, form({ date: named.date, classCode: named.classCode, errorCode: "" }))).toEqual([]);
    const other = ds.students.find((s) => s.classCode === named.classCode && !named.students.some((n) => n.id === s.id));
    expect(entryDuplicates(ds.incidents, form({ date: named.date, classCode: named.classCode, errorCode: named.errorCode, studentIds: [other!.id] }))).toEqual([]);
    expect(entryDuplicates(ds.incidents, form({ date: named.date, classCode: named.classCode, errorCode: "L35", studentIds: [named.students[0].id] }))).toEqual([]);
  });

  it("collective records without named students match each other", () => {
    const unnamed = byId(V2_FIXTURE_IDS.dupUnnamedOf);
    const found = entryDuplicates(ds.incidents, form({ date: unnamed.date, classCode: unnamed.classCode, errorCode: unnamed.errorCode, scope: "Tập thể" }));
    expect(found.map((i) => i.id)).toEqual(expect.arrayContaining([V2_FIXTURE_IDS.dupUnnamedOf, V2_FIXTURE_IDS.dupUnnamed]));
  });

  it("on edit: the record itself and pairs already reviewed with it never match", () => {
    const edited = byId(V2_FIXTURE_IDS.dupNamed);
    const f = formFromIncident(edited);
    expect(entryDuplicateDraft(f, edited).excludeId).toBe(edited.id);
    expect(entryDuplicates(ds.incidents, f, edited).map((i) => i.id)).toEqual([V2_FIXTURE_IDS.dupNamedOf]);
    const reviewed = byId(V2_FIXTURE_IDS.reviewed);
    expect(entryDuplicates(ds.incidents, formFromIncident(reviewed), reviewed)).toEqual([]);
  });

  it("describes a match: code, người ghi, giờ ghi, học sinh", () => {
    expect(recorderOf({ reporter: " Cô Lan ", createdByName: "x" })).toBe("Cô Lan");
    expect(recorderOf({ createdByName: "Lê Thị C" })).toBe("Lê Thị C");
    expect(recordedAtText({ createdAt: "2026-10-21T03:05:00.000Z" }, today)).toBe("10:05");
    expect(recordedAtText({ createdAt: "2026-10-20T03:05:00.000Z" }, today)).toBe("10:05 · 20/10");
    const label = duplicateLabel(named, today, roster);
    expect(label.startsWith(`${named.code} (`)).toBe(true);
    expect(label).toContain(recorderOf(named));
    expect(label).toContain(roster.get(named.students[0].id)?.name ?? named.students[0].name);
    expect(duplicateNoticeText([named], today, roster)).toBe(`Có thể trùng với ${label}`);
    expect(duplicateNoticeText([named, named], today, roster)).toMatch(/^Có thể trùng với 2 sự việc đã ghi: /);
    expect(duplicateNoticeText([], today)).toBe("");
  });

  it("'Không trùng, vẫn lưu' sends notDuplicateOf (unique, sorted, ≤ 20) accepted by the contract", () => {
    const f = form({ date: named.date, classCode: named.classCode, errorCode: named.errorCode, studentIds: [named.students[0].id] });
    const preview = computeEntryPreview(ds, f, today);
    const base = toIncidentCreateInput(ds.levelId, f, preview.unit!);
    expect(withNotDuplicate(base, [])).toBe(base);
    const ids = notDuplicateIds([named, byId(V2_FIXTURE_IDS.dupNamed), named]);
    expect(ids).toEqual([V2_FIXTURE_IDS.dupNamedOf, V2_FIXTURE_IDS.dupNamed].sort());
    const payload = withNotDuplicate(base, ids);
    expect(payload.notDuplicateOf).toEqual(ids);
    expect(IncidentCreateSchema.safeParse({ ...payload, clientRequestId: "abcdefgh12" }).success).toBe(true);
    const many = Array.from({ length: 25 }, (_, k) => ({ id: `THCS_NN-20261020-${String(k).padStart(4, "0")}` }));
    expect(notDuplicateIds(many)).toHaveLength(20);
  });
});

describe("duplicate warning render", () => {
  it("shows the notice with 'Xem' buttons and nothing without matches", () => {
    const html = renderToStaticMarkup(h(DuplicateNotice, { duplicates: [named], today, roster, onOpen: () => undefined }));
    expect(html).toContain("Có thể trùng với");
    expect(html).toContain(`Xem ${named.code}`);
    expect(renderToStaticMarkup(h(DuplicateNotice, { duplicates: [], today, onOpen: () => undefined }))).toBe("");
  });

  it("the action bar keeps saving possible but says 'Có thể trùng'", () => {
    const f = form({ date: named.date, classCode: named.classCode, errorCode: named.errorCode, studentIds: [named.students[0].id] });
    const base = { mode: "create" as const, saving: null, uploading: false, onSave: () => {}, onSaveNext: () => {}, onCancelEdit: () => {}, previewId: "p" };
    const html = renderToStaticMarkup(h(EntryActionBar, { ...base, preview: computeEntryPreview(ds, f, today), duplicateCodes: [named.code, "NN-x"] }));
    expect(html).toContain(`Có thể trùng ${named.code}`);
    expect(html).toContain("(+1)");
    expect(html).not.toContain(' disabled=""');
  });
});

describe("entry tabs", () => {
  const both = { incidents: true, inspections: true };

  it("lists the tabs the user may open; edit mode forces Sự việc", () => {
    expect(entryTabsFor(both)).toEqual(["su-viec", "kiem-tra"]);
    expect(entryTabsFor({ incidents: true, inspections: false })).toEqual(["su-viec"]);
    expect(entryTabsFor({ incidents: false, inspections: true })).toEqual(["kiem-tra"]);
    expect(entryTabsFor({ ...both, editing: true })).toEqual(["su-viec"]);
  });

  it("resolves ?tab= (unknown / forbidden → first allowed tab)", () => {
    expect(resolveEntryTab(null, both)).toBe("su-viec");
    expect(resolveEntryTab("kiem-tra", both)).toBe("kiem-tra");
    expect(resolveEntryTab("kiem-tra", { ...both, editing: true })).toBe("su-viec");
    expect(resolveEntryTab("kiem-tra", { incidents: true, inspections: false })).toBe("su-viec");
    expect(resolveEntryTab("xyz", { incidents: false, inspections: true })).toBe("kiem-tra");
  });

  it("keeps other query params when switching", () => {
    expect(entryTabQuery("edit=x&a=1", "kiem-tra")).toBe("edit=x&a=1&tab=kiem-tra");
    expect(entryTabQuery("tab=kiem-tra&a=1", "su-viec")).toBe("a=1");
  });
});
