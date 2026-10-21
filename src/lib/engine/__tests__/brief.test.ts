import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "../__fixtures__/dataset";
import { computeKpis, recidivism } from "../analytics";
import { buildDecisionBrief } from "../brief";
import { formatNumberVN } from "../text";

const OCT = { mode: "month" as const, key: "2026-10" };
const OWNER_RE = /^(GVCN lớp \S+|Cán bộ nền nếp|BGH)$/;
const SEVERITY = { high: 0, medium: 1, low: 2 } as const;
const PRIORITY = { High: 0, Medium: 1, Low: 2 } as const;

describe("buildDecisionBrief – empty data", () => {
  it("dataset without incidents", () => {
    const ds = makeFixtureDataset();
    ds.incidents = [];
    ds.rewards = [];
    const b = buildDecisionBrief(ds, OCT, FIXTURE_TODAY);
    expect(b.title).toBe("Tóm tắt điều hành nền nếp – Trung học cơ sở");
    expect(b.periodLabel).toBe("Tháng 10/2026");
    expect(b.summary).toContain("Chưa có dữ liệu trong kỳ");
    expect(b.findings).toEqual([]);
    expect(b.evidence.length).toBeGreaterThan(0);
    expect(b.impact).toBe("Chưa đủ dữ liệu để đánh giá tác động.");
    expect(b.recommendations).toEqual([
      { title: "Kiểm tra việc ghi nhận nền nếp hằng ngày để bảo đảm dữ liệu đầy đủ", priority: "Low", owner: "Cán bộ nền nếp", deadlineDays: 14 },
    ]);
  });

  it("period without incidents (holiday / future week)", () => {
    const ds = makeFixtureDataset();
    expect(buildDecisionBrief(ds, { mode: "week", key: "2026-08-31" }, FIXTURE_TODAY).summary).toContain("Chưa có dữ liệu trong kỳ");
    expect(buildDecisionBrief(ds, { mode: "month", key: "2027-03" }, FIXTURE_TODAY).findings).toEqual([]);
  });
});

describe("buildDecisionBrief – fixture October", () => {
  const ds = makeFixtureDataset();
  const b = buildDecisionBrief(ds, OCT, FIXTURE_TODAY);
  const k = computeKpis(ds, { period: OCT });
  const prev = computeKpis(ds, { period: { mode: "month", key: "2026-09" } });

  it("summary carries the KPIs and the % change vs the previous period", () => {
    expect(b.summary.startsWith("Tháng 10/2026: ghi nhận ")).toBe(true);
    expect(b.summary).toContain(`${k.incidents} sự việc`);
    expect(b.summary).toContain(`${formatNumberVN(k.penaltyPoints)} điểm trừ`);
    const pct = Math.round(((k.penaltyPoints - prev.penaltyPoints) / prev.penaltyPoints) * 100);
    expect(b.summary).toContain(`tăng ${pct}%`);
    expect(b.summary).toContain("Kỳ so sánh: Tháng 9/2026.");
  });

  it("findings cover RED/YELLOW classes, recidivists, data quality and 5S, sorted by severity", () => {
    const titles = b.findings.map((f) => f.title);
    expect(titles).toContain("1 lớp ở mức Đỏ");
    expect(titles).toContain("1 lớp ở mức Vàng");
    expect(titles.some((t) => t.includes("học sinh cần theo dõi tái phạm"))).toBe(true);
    expect(titles.some((t) => t.startsWith("Lỗi nổi bật"))).toBe(true);
    expect(titles.some((t) => t.startsWith("Vi phạm 5S"))).toBe(true);
    expect(b.findings.find((f) => f.title === "1 lớp ở mức Đỏ")).toMatchObject({ severity: "high" });
    expect(b.findings.find((f) => f.title === "1 lớp ở mức Đỏ")?.detail).toContain("6A03 (25,67 điểm trừ/tuần)");
    const quality = b.findings.find((f) => f.title === "Dữ liệu cần rà soát");
    expect(quality?.detail).toContain("7A03 (50%)");
    for (let i = 1; i < b.findings.length; i++) {
      expect(SEVERITY[b.findings[i - 1].severity] <= SEVERITY[b.findings[i].severity]).toBe(true);
    }
  });

  it("evidence bullets contain numbers", () => {
    expect(b.evidence.length).toBeGreaterThanOrEqual(5);
    expect(b.evidence.every((e) => /\d/.test(e))).toBe(true);
    expect(b.evidence[0]).toBe(`Sự việc: ${k.incidents} (kỳ trước: ${prev.incidents}, không đổi).`);
  });

  it("impact sentence mentions the main risks", () => {
    expect(b.impact).toContain("1 lớp mức Đỏ");
    expect(b.impact).toContain("tái phạm");
  });

  it("recommendations have owners, SLA deadlines and class scope", () => {
    expect(b.recommendations.length).toBeGreaterThan(0);
    expect(b.recommendations.length).toBeLessThanOrEqual(8);
    for (const r of b.recommendations) {
      expect(r.owner).toMatch(OWNER_RE);
      expect(r.deadlineDays).toBe(ds.config.actionSlaDays[r.priority]);
      if (r.owner.startsWith("GVCN lớp ")) expect(r.scopeClass).toBe(r.owner.slice("GVCN lớp ".length));
    }
    expect(b.recommendations[0]).toMatchObject({ priority: "High", owner: "GVCN lớp 6A03", scopeClass: "6A03", deadlineDays: 3 });
    expect(b.recommendations.some((r) => r.owner === "GVCN lớp 7A02" && r.priority === "Medium")).toBe(true);
    expect(b.recommendations.some((r) => r.owner === "Cán bộ nền nếp" && r.title.includes("Phạm Thiện Khôi"))).toBe(true);
    for (let i = 1; i < b.recommendations.length; i++) {
      expect(PRIORITY[b.recommendations[i - 1].priority] <= PRIORITY[b.recommendations[i].priority]).toBe(true);
    }
    // the grade-7 leader 7A03 has unreliable data → not praised
    expect(b.recommendations.some((r) => r.title.includes("7A03"))).toBe(false);
  });

  it("is deterministic", () => {
    expect(buildDecisionBrief(makeFixtureDataset(), OCT, FIXTURE_TODAY)).toEqual(b);
  });
});

describe("buildDecisionBrief – unapproved thresholds", () => {
  it("reports the missing approval and asks BGH to approve", () => {
    const ds = makeFixtureDataset();
    ds.config.rag.approved = false;
    const b = buildDecisionBrief(ds, OCT, FIXTURE_TODAY);
    expect(b.findings.some((f) => f.title === "Ngưỡng cảnh báo chưa được phê duyệt")).toBe(true);
    expect(b.findings.some((f) => f.title.includes("mức Đỏ"))).toBe(false);
    expect(b.recommendations.some((r) => r.owner === "BGH" && r.title.startsWith("Phê duyệt ngưỡng cảnh báo RAG"))).toBe(true);
    expect(b.recommendations.some((r) => r.title.includes("tuần liên tiếp"))).toBe(false);
  });
});

describe("buildDecisionBrief – week with a 5S increase", () => {
  it("flags the 5S trend and recommends a 5S campaign", () => {
    const b = buildDecisionBrief(makeFixtureDataset(), { mode: "week", key: "2026-10-12" }, FIXTURE_TODAY);
    expect(b.periodLabel).toBe("Tuần 12/10 – 18/10/2026");
    expect(b.findings.find((f) => f.title.startsWith("Vi phạm 5S tăng"))?.severity).toBe("medium");
    expect(b.recommendations.some((r) => r.title.startsWith("Phát động đợt chấn chỉnh vệ sinh 5S"))).toBe(true);
    // Đạt (7A01) reoffends on 13/10 after 29/09 – within the 4-week window, across the week boundary.
    const flagged = recidivism(makeFixtureDataset(), { period: { mode: "week", key: "2026-10-12" } }, FIXTURE_TODAY).students;
    expect(flagged.map((s) => s.id)).toEqual(expect.arrayContaining([FIXTURE_STUDENT_IDS.khoi, FIXTURE_STUDENT_IDS.dat]));
    const students = b.findings.find((f) => f.title === `${flagged.length} học sinh cần theo dõi tái phạm`);
    expect(students?.detail).toContain("1 học sinh có từ 3 sự việc trở lên trong một tuần: Phạm Thiện Khôi (6A03)");
    expect(students?.detail).toContain("học sinh tái phạm trong vòng 4 tuần: Đỗ Văn Đạt (7A01)");
    expect(b.recommendations.some((r) => r.title.startsWith(`Theo dõi và nhắc nhở ${flagged.length - 1} học sinh tái phạm`))).toBe(true);
  });
});

describe("buildDecisionBrief – default week period (FR-RAG-004)", () => {
  const ds = makeFixtureDataset();
  const b = buildDecisionBrief(ds, { mode: "week", key: "2026-10-19" }, FIXTURE_TODAY);

  it("reports classes above the yellow threshold for consecutive weeks (streak over the semester up to this week)", () => {
    const f = b.findings.find((x) => x.title === "2 lớp vượt ngưỡng Vàng nhiều tuần liên tiếp");
    expect(f).toMatchObject({ detail: "6A03 (4 tuần), 7A02 (3 tuần).", severity: "high" });
    expect(b.recommendations.some((r) => r.scopeClass === "6A03")).toBe(true);
    expect(b.recommendations.some((r) => r.scopeClass === "7A02")).toBe(true);
  });

  it("reports students reoffending across weeks and recommends follow-up", () => {
    const flagged = recidivism(ds, { period: { mode: "week", key: "2026-10-19" } }, FIXTURE_TODAY).students;
    expect(flagged.length).toBeGreaterThan(0);
    expect(b.findings.some((x) => x.title === `${flagged.length} học sinh cần theo dõi tái phạm`)).toBe(true);
    expect(b.recommendations.some((r) => r.owner === "Cán bộ nền nếp" && r.title.startsWith(`Theo dõi và nhắc nhở ${flagged.length} học sinh tái phạm`))).toBe(true);
    expect(b.impact).toContain(`${flagged.length} học sinh có dấu hiệu tái phạm`);
  });
});
