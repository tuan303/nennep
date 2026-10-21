import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { activeStudentsOfClass, selectedStudents } from "../lib/student-options";
import { StudentPicker } from "../student-picker";

(globalThis as { React?: typeof React }).React = React;

const ds = makeFixtureDataset();
const roster = activeStudentsOfClass(ds.students, "6A02");
const rosterById = new Map(roster.map((s) => [s.id, s] as const));
const allById = new Map(ds.students.map((s) => [s.id, s] as const));
const active = roster[0];
const transferred = FIXTURE_STUDENT_IDS.long; // Vũ Hoàng Long, TRANSFERRED_OUT of 6A02 since

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("selectedStudents (StudentPicker chips)", () => {
  it("keeps the edited record's students valid even after they left the class", () => {
    const chips = selectedStudents([active.id, transferred, "99999999"], rosterById, allById, [{ id: transferred, name: "Vũ Hoàng Long" }]);
    expect(chips.map((c) => [c.id, c.state])).toEqual([
      [active.id, "active"],
      [transferred, "kept"],
      ["99999999", "invalid"],
    ]);
  });

  it("flags a student who left the class when they are not on the edited record (new record / class changed)", () => {
    expect(selectedStudents([transferred], rosterById, allById).map((c) => c.state)).toEqual(["invalid"]);
  });

  it("names a kept student from the record snapshot when the dataset no longer has them", () => {
    const chips = selectedStudents(["26069999"], rosterById, new Map(), [{ id: "26069999", name: "Đỗ Minh Khang" }]);
    expect(chips).toEqual([{ id: "26069999", name: "Đỗ Minh Khang", state: "kept" }]);
  });
});

describe("StudentPicker (edit mode)", () => {
  const props = { ds, classCode: "6A02", value: [active.id, transferred], onChange: () => undefined };

  it("does not ask to remove students the server keeps on the edited record", () => {
    const out = text(renderToStaticMarkup(createElement(StudentPicker, { ...props, keptStudents: [{ id: transferred, name: "Vũ Hoàng Long" }] })));
    expect(out).toContain("vẫn được giữ trong bản ghi này");
    expect(out).not.toContain("Vui lòng bỏ chọn trước khi lưu");
  });

  it("still warns about students that would fail validation", () => {
    const out = text(renderToStaticMarkup(createElement(StudentPicker, props)));
    expect(out).toContain("1 học sinh không còn đang học ở lớp 6A02. Vui lòng bỏ chọn trước khi lưu.");
  });
});
