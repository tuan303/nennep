/** REQ_V2 §7.3: "Có thể trùng" groups / review requests and the integrity card of "Chất lượng dữ liệu". */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2_FIXTURE_IDS, makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import { NotDuplicateSchema } from "@/lib/contract";
import { filterIncidents, findPossibleDuplicates, integrityIssues } from "@/lib/engine";
import { rosterNames } from "@/components/entry/lib/student-names";
import { DuplicateGroupCard } from "../duplicates-tab";
import { DUPLICATE_REASON_LABELS, duplicateDeleteReason, duplicateTotals, integrityCounts, integrityIncidentCount, notDuplicateRequest } from "../lib/duplicates-view";
import { IntegrityCard } from "../quality-tab";

const ds = makeV2FixtureDataset();
const all = filterIncidents(ds, { period: { mode: "all" } });
const groups = findPossibleDuplicates(all);
const named = groups.find((g) => g.incidents.some((i) => i.id === V2_FIXTURE_IDS.dupNamed));
const unnamed = groups.find((g) => g.incidents.some((i) => i.id === V2_FIXTURE_IDS.dupUnnamed));

describe("possible duplicates view", () => {
  it("finds the fixture pairs and never the reviewed one", () => {
    expect(named?.reason).toBe("SAME_STUDENTS");
    expect(unnamed?.reason).toBe("NO_NAMED_STUDENTS");
    expect(groups.some((g) => g.incidents.some((i) => i.id === V2_FIXTURE_IDS.reviewed))).toBe(false);
    expect(DUPLICATE_REASON_LABELS.NO_NAMED_STUDENTS).toBe("Đều không ghi tên học sinh");
  });

  it("totals the groups and the penalty that may be counted twice", () => {
    const t = duplicateTotals(groups);
    expect(t.groups).toBe(groups.length);
    expect(t.records).toBe(groups.reduce((n, g) => n + g.incidents.length, 0));
    expect(t.extraPoints).toBe(groups.reduce((n, g) => n + g.extraPoints, 0));
    expect(duplicateTotals([])).toEqual({ groups: 0, records: 0, extraPoints: 0 });
  });

  it("'Không trùng' marks every member against the oldest one (contract-valid)", () => {
    const req = notDuplicateRequest(named!);
    expect(req?.id).toBe(named!.incidents[0].id);
    expect(req?.input.otherIds).toEqual(named!.incidents.slice(1).map((i) => i.id));
    expect(NotDuplicateSchema.safeParse(req?.input).success).toBe(true);
    expect(notDuplicateRequest({ incidents: [named!.incidents[0]] })).toBeUndefined();
  });

  it("suggests 'Trùng với <oldest other>' as the delete reason", () => {
    const [first, second] = named!.incidents;
    expect(duplicateDeleteReason(second, named!)).toBe(`Trùng với ${first.code}`);
    expect(duplicateDeleteReason(first, named!)).toBe(`Trùng với ${second.code}`);
  });

  it("renders a group with scope, recorder, points and the actions", () => {
    const html = renderToStaticMarkup(h(DuplicateGroupCard, { group: named!, roster: rosterNames(ds.students), busy: false, onNotDuplicate: () => undefined, onOpen: () => undefined }));
    expect(html).toContain("Không trùng");
    expect(html).toContain(`Có thể tính trùng −${named!.extraPoints}`);
    expect(html).toContain("Ghi sớm nhất");
    expect(html).toContain(named!.incidents[1].code);
    expect(html).toMatch(/Cá nhân|Tập thể/);
    expect(html).toContain(`Mở sự việc ${named!.incidents[0].code}`);
  });
});

describe("integrity card", () => {
  const issues = integrityIssues(all);

  it("counts issues per kind and affected records", () => {
    const counts = integrityCounts(issues);
    expect(counts.POINTS_FORMULA).toBeGreaterThanOrEqual(1);
    expect(counts.POINTS_FORMULA + counts.STUDENT_COUNT + counts.STUDENT_CLASS).toBe(issues.length);
    expect(issues.some((i) => i.incident.id === V2_FIXTURE_IDS.defect)).toBe(true);
    expect(integrityIncidentCount(issues)).toBeLessThanOrEqual(issues.length);
    expect(integrityCounts([])).toEqual({ POINTS_FORMULA: 0, STUDENT_COUNT: 0, STUDENT_CLASS: 0 });
  });

  it("lists the defects and links to the duplicates", () => {
    const html = renderToStaticMarkup(h(IntegrityCard, { incidents: all, duplicates: duplicateTotals(groups), onGoDuplicates: () => undefined, onOpen: () => undefined }));
    expect(html).toContain("Kiểm tra công thức &amp; dữ liệu");
    expect(html).toContain("Sai công thức điểm");
    expect(html).toContain("Điểm trừ lưu 10 khác công thức 5");
    expect(html).toContain("Xem nhóm có thể trùng");
  });

  it("says when nothing is wrong", () => {
    const clean = all.filter((i) => !issues.some((x) => x.incident.id === i.id));
    const html = renderToStaticMarkup(h(IntegrityCard, { incidents: clean, duplicates: duplicateTotals([]) }));
    expect(html).toContain("Không phát hiện sai lệch");
    expect(html).not.toContain("Xem nhóm có thể trùng");
  });
});
