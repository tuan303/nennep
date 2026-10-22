import { describe, expect, it } from "vitest";
import { groupSections, rolesText, sectionForRole } from "../guide-meta";
import { guideIcon } from "../guide-icons";
import { blockText, buildGuideIndex, guideTextMatches, queryTokens, searchGuide, sectionSearchText } from "../search";
import { FIXTURE_GUIDE } from "./fixture";

const index = buildGuideIndex(FIXTURE_GUIDE);
const ids = (q: string) => [...searchGuide(index, q).sectionIds];

describe("guide search", () => {
  it("is accent- and case-insensitive (Vietnamese, incl. đ)", () => {
    expect(guideTextMatches("Điểm thưởng đã xác nhận", "diem thuong")).toBe(true);
    expect(guideTextMatches("Điểm thưởng đã xác nhận", "ĐIỂM   THƯỞNG")).toBe(true);
    expect(guideTextMatches("Đợt kiểm tra", "dot kiem")).toBe(true);
    expect(guideTextMatches("Xếp hạng", "xep hang thuong")).toBe(false);
    expect(queryTokens("  Xếp   Hạng ")).toEqual(["xep", "hang"]);
  });

  it("finds sections by title, summary and body text (markup removed)", () => {
    expect(ids("xep hang")).toEqual(["xep-hang"]);
    expect(ids("moi tuan duoc tinh")).toEqual(["xep-hang"]); // table cell
    expect(ids("luu nhap tiep")).toEqual(["nhap-lieu"]); // [[chip]] inside a tip
    expect(ids("dang nhap")).toEqual(["loi-thuong-gap"]);
  });

  it("requires every word and reports FAQ / glossary matches", () => {
    const r = searchGuide(index, "xac nhan");
    expect(r.active).toBe(true);
    expect([...r.faq]).toEqual([0]);
    expect(r.sectionIds.size).toBe(0);
    const g = searchGuide(index, "luot vi pham");
    expect([...g.glossary]).toEqual([1]);
    expect(g.total).toBe(g.sectionIds.size + g.faq.size + g.glossary.size);
    expect(searchGuide(index, "khong ton tai tu nay").total).toBe(0);
  });

  it("ranks title matches before summary and body matches (document order otherwise)", () => {
    const sec = (id: string, title: string, summary: string, body: string) => ({ id, title, icon: "BookOpen", group: "xem" as const, roles: "all" as const, summary, blocks: [{ kind: "p" as const, text: body }] });
    const content = {
      ...FIXTURE_GUIDE,
      sections: [
        sec("a", "Xếp hạng", "Bảng thi đua.", "Gồm điểm thưởng đã xác nhận."),
        sec("b", "Báo cáo", "Tổng hợp **điểm thưởng** theo tuần.", "In và lưu PDF."),
        sec("c", "Điểm thưởng", "Ghi nhận và xác minh.", "Mức +1 đến +5."),
      ],
    };
    expect(searchGuide(buildGuideIndex(content), "diem thuong").ranked).toEqual(["c", "b", "a"]);
    expect(searchGuide(buildGuideIndex(content), "").ranked).toEqual(["a", "b", "c"]);
  });

  it("an empty query shows everything", () => {
    const r = searchGuide(index, "   ");
    expect(r.active).toBe(false);
    expect(r.sectionIds.size).toBe(FIXTURE_GUIDE.sections.length);
    expect(r.faq.size).toBe(FIXTURE_GUIDE.faq.length);
    expect(r.glossary.size).toBe(FIXTURE_GUIDE.glossary.length);
  });

  it("indexes every block kind as plain text", () => {
    const text = sectionSearchText(FIXTURE_GUIDE.sections[1]);
    expect(text).toContain("Bấm Lưu.");
    expect(text).not.toContain("[[");
    expect(text).not.toContain("**");
    expect(blockText({ kind: "demo", demo: "formula" })).toContain("công thức");
    expect(blockText({ kind: "table", head: ["A"], rows: [["`L03`"]] })).toContain("L03");
  });
});

describe("guide meta", () => {
  it("groups sections in the fixed group order", () => {
    expect(groupSections(FIXTURE_GUIDE.sections).map((g) => [g.group, g.label])).toEqual([
      ["xem", "Xem & theo dõi"],
      ["ghinhan", "Ghi nhận"],
      ["hoidap", "Câu hỏi thường gặp"],
    ]);
  });

  it("names roles like the app and checks section roles", () => {
    expect(rolesText("all")).toBe("Mọi vai trò");
    expect(rolesText(["GVCN", "ADMIN"])).toBe("Quản trị, GVCN");
    expect(rolesText(["ADMIN", "EDITOR", "VIEWER", "GVCN"])).toBe("Mọi vai trò");
    expect(sectionForRole({ roles: ["ADMIN", "EDITOR"] }, "EDITOR")).toBe(true);
    expect(sectionForRole({ roles: ["ADMIN", "EDITOR"] }, "GVCN")).toBe(false);
    expect(sectionForRole({ roles: "all" }, undefined)).toBe(true);
  });

  it("maps icon names, with old lucide names and a BookOpen fallback", () => {
    expect(guideIcon("Trophy")).toBe(guideIcon("Trophy"));
    expect(guideIcon("AlertTriangle")).toBe(guideIcon("TriangleAlert"));
    expect(guideIcon("KhongCoIconNay")).toBe(guideIcon("BookOpen"));
    expect(guideIcon("toString")).toBe(guideIcon("BookOpen"));
  });
});
