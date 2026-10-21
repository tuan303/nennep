import { describe, expect, it } from "vitest";
import { makeFixtureDataset, FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import { exportLevelWorkbook } from "../export-workbook";
import { parseNshmWorkbook } from "../parse-workbook";

describe("unnamed student counts survive export → import", () => {
  it("keeps unnamedCount of THIEU_TEN_HS incidents", async () => {
    const ds = makeFixtureDataset();
    const withUnnamed = ds.incidents.filter((i) => i.unnamedCount > 0);
    expect(withUnnamed.length).toBeGreaterThan(0);

    const bytes = await exportLevelWorkbook(ds, { today: FIXTURE_TODAY, levelName: "THCS" });
    const { payload } = await parseNshmWorkbook(bytes, "export.xlsx");

    const byCode = new Map(payload.incidents.map((i) => [i.code, i]));
    for (const inc of withUnnamed) {
      expect(byCode.get(inc.code)?.unnamedCount).toBe(inc.unnamedCount);
    }
    const named = ds.incidents.find((i) => i.unnamedCount === 0);
    expect(byCode.get(named!.code)?.unnamedCount).toBeUndefined();
  });
});
