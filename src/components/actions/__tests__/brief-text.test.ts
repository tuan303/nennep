import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { buildDecisionBrief } from "@/lib/engine";
import { BRIEF_DISCLAIMER, SEVERITY_META, briefToText, recommendationDeadline } from "../lib/brief-text";

describe("briefToText", () => {
  const ds = makeFixtureDataset();
  const brief = buildDecisionBrief(ds, { mode: "month", key: "2026-10" }, FIXTURE_TODAY);
  const text = briefToText(brief, { today: FIXTURE_TODAY });

  it("renders every memo section in order", () => {
    const order = ["1. Tóm tắt", "2. Phát hiện chính", "3. Bằng chứng", "4. Tác động", "5. Đề xuất hành động", BRIEF_DISCLAIMER];
    const idx = order.map((h) => text.indexOf(h));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(text.split("\n")[0]).toBe(brief.title.toLocaleUpperCase("vi"));
    expect(text).toContain("Kỳ: Tháng 10/2026 · Lập ngày 21/10/2026");
    expect(text).toContain(brief.summary);
  });

  it("lists findings with severity labels and recommendations with deadlines", () => {
    const f = brief.findings[0];
    expect(text).toContain(`- [${SEVERITY_META[f.severity].label}] ${f.title}: ${f.detail}`);
    const r = brief.recommendations[0];
    expect(text).toContain(`1) ${r.title}`);
    expect(text).toContain(`Phụ trách: ${r.owner}`);
    const due = recommendationDeadline(FIXTURE_TODAY, r.deadlineDays);
    expect(text).toContain(`Hạn: ${due.slice(8, 10)}/${due.slice(5, 7)}/${due.slice(0, 4)} (${r.deadlineDays} ngày)`);
  });

  it("handles an empty period", () => {
    const empty = buildDecisionBrief(ds, { mode: "week", key: "2026-08-31" }, FIXTURE_TODAY);
    const t = briefToText(empty, { today: FIXTURE_TODAY });
    expect(t).toContain("- Không có phát hiện nổi bật trong kỳ.");
    expect(t).toContain("Chưa có dữ liệu trong kỳ");
  });

  it("severity look", () => {
    expect(SEVERITY_META.high).toEqual({ label: "Cao", tone: "bad" });
    expect(SEVERITY_META.medium.label).toBe("Trung bình");
    expect(SEVERITY_META.low.label).toBe("Thấp");
  });
});
