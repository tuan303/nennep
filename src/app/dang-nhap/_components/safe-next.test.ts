import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps same-origin app paths with query and hash", () => {
    expect(safeNextPath("/xep-hang")).toBe("/xep-hang");
    expect(safeNextPath("/lop?class=6A01&mode=week&key=2026-10-12")).toBe("/lop?class=6A01&mode=week&key=2026-10-12");
    expect(safeNextPath("/hoc-sinh#top")).toBe("/hoc-sinh#top");
  });

  it("falls back to / for empty or foreign targets", () => {
    for (const bad of [null, undefined, "", "xep-hang", "https://evil.example", "//evil.example/x", "/\\evil.example", "\\\\evil", "javascript:alert(1)", "/a\nb"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });

  it("never loops back to the login page or the API", () => {
    expect(safeNextPath("/dang-nhap")).toBe("/");
    expect(safeNextPath("/dang-nhap?next=/x")).toBe("/");
    expect(safeNextPath("/api/me")).toBe("/");
  });

  it("normalises dot segments", () => {
    expect(safeNextPath("/x/../cai-dat")).toBe("/cai-dat");
    expect(safeNextPath("/x/../dang-nhap")).toBe("/");
  });
});
