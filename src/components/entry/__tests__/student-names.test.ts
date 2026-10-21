/**
 * INTEGRITY-19 regression: a student name corrected in the roster shows everywhere a record is described – Báo GVCN
 * (table, Zalo text, Excel rows), Dữ liệu & rà soát and Nhập liệu "Ghi nhận gần đây" – while the stored snapshot
 * (history / audit) is untouched.
 */
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { filterIncidentRows, subjectsText } from "@/components/data-inspect/lib/incident-rows";
import { buildCopyText } from "@/components/gvcn-report/lib/copy-text";
import { buildGvcnReport, subjectText } from "@/components/gvcn-report/lib/report-model";
import { SubjectCell } from "@/components/gvcn-report/incident-cells";
import type { LevelDataset, Period } from "@/lib/types";
import { subjectSummary } from "../lib/recent";
import { rosterNames, studentDisplayName, withRosterNames } from "../lib/student-names";

Object.assign(globalThis, { React });

const KHOI = FIXTURE_STUDENT_IDS.khoi;
const CORRECT = "Phạm Thiện Khôi";
const MISSPELLED = "Phạm Min Khôi";
const WEEK: Period = { mode: "week", key: "2026-10-12" };

/** Incidents were recorded with a misspelled name; the admin has since corrected the roster. */
function correctedDataset(): LevelDataset {
  const ds = makeFixtureDataset();
  return {
    ...ds,
    incidents: ds.incidents.map((i) => ({ ...i, students: i.students.map((s) => (s.id === KHOI ? { ...s, name: MISSPELLED } : s)) })),
  };
}

describe("studentDisplayName / withRosterNames", () => {
  const roster = rosterNames([{ id: "s1", name: "Nguyễn An" }]);

  it("prefers the roster name and falls back to the snapshot", () => {
    expect(studentDisplayName({ id: "s1", name: "Nguyen An" }, roster)).toBe("Nguyễn An");
    expect(studentDisplayName({ id: "s2", name: "Trần Bình" }, roster)).toBe("Trần Bình"); // not in this viewer's roster
    expect(studentDisplayName({ id: "s1", name: "Nguyen An" })).toBe("Nguyen An");
  });

  it("returns a display copy only when a name differs", () => {
    const rec = { students: [{ id: "s1", name: "Nguyen An", classCode: "6A01" }] };
    const copy = withRosterNames(rec, roster);
    expect(copy).not.toBe(rec);
    expect(copy.students[0]).toEqual({ id: "s1", name: "Nguyễn An", classCode: "6A01" });
    expect(rec.students[0].name).toBe("Nguyen An"); // snapshot untouched
    const same = { students: [{ id: "s1", name: "Nguyễn An", classCode: "6A01" }] };
    expect(withRosterNames(same, roster)).toBe(same);
  });
});

describe("Báo GVCN uses the corrected name", () => {
  const ds = correctedDataset();
  const report = buildGvcnReport(ds, "6A03", WEEK, FIXTURE_TODAY);
  const khoiRows = report.incidents.filter((i) => i.students.some((s) => s.id === KHOI));

  it("in the report rows (table, search, Excel export) and the Zalo text", () => {
    expect(khoiRows.length).toBeGreaterThan(0);
    for (const i of khoiRows) expect(subjectText(i)).toContain(CORRECT);
    const text = buildCopyText(report, "Tuần 12/10 – 18/10/2026", FIXTURE_TODAY);
    expect(text).toContain(CORRECT);
    expect(text).not.toContain(MISSPELLED);
    expect(renderToStaticMarkup(createElement(SubjectCell, { incident: khoiRows[0] }))).toContain(CORRECT);
  });

  it("keeps the stored snapshot unchanged", () => {
    const stored = ds.incidents.filter((i) => i.students.some((s) => s.id === KHOI));
    expect(stored.every((i) => i.students.find((s) => s.id === KHOI)?.name === MISSPELLED)).toBe(true);
    expect(khoiRows.every((i) => i.students.find((s) => s.id === KHOI)?.classCode === "6A03")).toBe(true);
  });

  it("subjectText accepts a roster for records outside the report", () => {
    const raw = ds.incidents.find((i) => i.students.some((s) => s.id === KHOI))!;
    expect(subjectText(raw)).toContain(MISSPELLED);
    expect(subjectText(raw, rosterNames(ds.students))).toContain(CORRECT);
  });
});

describe("Dữ liệu & Nhập liệu use the corrected name", () => {
  const ds = correctedDataset();
  const roster = rosterNames(ds.students);
  const raw = ds.incidents.filter((i) => i.students.some((s) => s.id === KHOI));

  it("data-inspect subject line and search (new and old spelling)", () => {
    expect(subjectsText(raw[0], roster)).toContain(CORRECT);
    expect(subjectsText(raw[0], roster)).not.toContain(MISSPELLED);
    expect(filterIncidentRows(raw, { query: "pham thien khoi" }, roster)).toHaveLength(raw.length);
    expect(filterIncidentRows(raw, { query: "pham min khoi" }, roster)).toHaveLength(raw.length);
  });

  it("recent entries", () => {
    const one = raw.find((i) => i.students.length === 1)!;
    expect(subjectSummary(one, 2, roster)).toBe(CORRECT);
    expect(subjectSummary(one)).toBe(MISSPELLED);
  });
});
