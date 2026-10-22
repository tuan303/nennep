import { describe, expect, it } from "vitest";
import { inlineToPlain, isInternalHref, parseInline } from "../inline";

describe("parseInline", () => {
  it("keeps plain text as one node", () => {
    expect(parseInline("Chọn cấp học ở thanh trên cùng.")).toEqual([{ type: "text", text: "Chọn cấp học ở thanh trên cùng." }]);
    expect(parseInline("")).toEqual([]);
  });

  it("parses **bold**", () => {
    expect(parseInline("Điểm **thi đua** của lớp")).toEqual([
      { type: "text", text: "Điểm " },
      { type: "bold", children: [{ type: "text", text: "thi đua" }] },
      { type: "text", text: " của lớp" },
    ]);
  });

  it("parses `code` literally", () => {
    expect(parseInline("Mã dạng `NN-20261021-0001` và `**không đậm**`")).toEqual([
      { type: "text", text: "Mã dạng " },
      { type: "code", text: "NN-20261021-0001" },
      { type: "text", text: " và " },
      { type: "code", text: "**không đậm**" },
    ]);
  });

  it("parses [[UI label]] chips", () => {
    expect(parseInline("Bấm [[Lưu & nhập tiếp]] rồi [[Đóng]]")).toEqual([
      { type: "text", text: "Bấm " },
      { type: "chip", text: "Lưu & nhập tiếp" },
      { type: "text", text: " rồi " },
      { type: "chip", text: "Đóng" },
    ]);
  });

  it("parses internal [text](/route) links and anchors", () => {
    expect(parseInline("Xem [Xếp hạng](/xep-hang?view=bang) hoặc [mục này](#xep-hang).")).toEqual([
      { type: "text", text: "Xem " },
      { type: "link", text: "Xếp hạng", href: "/xep-hang?view=bang" },
      { type: "text", text: " hoặc " },
      { type: "link", text: "mục này", href: "#xep-hang" },
      { type: "text", text: "." },
    ]);
  });

  it("never renders external or protocol-relative destinations as links (label kept)", () => {
    expect(parseInline("Trang [ngoài](https://example.com) và [lạ](//example.com)")).toEqual([{ type: "text", text: "Trang ngoài và lạ" }]);
    expect(isInternalHref("/hoc-sinh")).toBe(true);
    expect(isInternalHref("#muc")).toBe(true);
    expect(isInternalHref("#")).toBe(false);
    expect(isInternalHref("javascript:alert(1)")).toBe(false);
  });

  it("handles mixed markup, chips inside bold, and a chip right before a link", () => {
    expect(parseInline("**Bước 1:** bấm **[[Nhập]]** ở [Nhập liệu](/nhap-lieu), gõ `6A01`.")).toEqual([
      { type: "bold", children: [{ type: "text", text: "Bước 1:" }] },
      { type: "text", text: " bấm " },
      { type: "bold", children: [{ type: "chip", text: "Nhập" }] },
      { type: "text", text: " ở " },
      { type: "link", text: "Nhập liệu", href: "/nhap-lieu" },
      { type: "text", text: ", gõ " },
      { type: "code", text: "6A01" },
      { type: "text", text: "." },
    ]);
    expect(parseInline("[[Lưu]][Hướng dẫn](/huong-dan)")).toEqual([
      { type: "chip", text: "Lưu" },
      { type: "link", text: "Hướng dẫn", href: "/huong-dan" },
    ]);
  });

  it("leaves unmatched markers as text", () => {
    expect(parseInline("2 ** 3 và [[chưa đóng và `lẻ")).toEqual([{ type: "text", text: "2 ** 3 và [[chưa đóng và `lẻ" }]);
    expect(parseInline("[không có đích] (/x)")).toEqual([{ type: "text", text: "[không có đích] (/x)" }]);
  });
});

describe("inlineToPlain", () => {
  it("strips the markup", () => {
    expect(inlineToPlain("Bấm [[Lưu]] ở **[Nhập liệu](/nhap-lieu)**, mã `L03`.")).toBe("Bấm Lưu ở Nhập liệu, mã L03.");
  });
});
