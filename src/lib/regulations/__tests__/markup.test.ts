/** REGULATION_MARKUP parser: every block kind, kept numbering, tables, anchors and tolerance (short fake content only). */
import { describe, expect, it } from "vitest";
import { hasRegulationContent, parseInline, parseRegulation, plainText, slugifyVN, splitTableRow, type RegulationBlock } from "../markup";

const SAMPLE = [
  "## CHƯƠNG I. QUY ĐỊNH CHUNG",
  "",
  "### Điều 1. Phạm vi áp dụng",
  "Văn bản mẫu dùng để kiểm thử,",
  "dòng này nối vào cùng đoạn.",
  "",
  "Đoạn thứ hai có **chữ đậm** ở giữa.",
  "",
  "### Điều 2. Hình thức",
  "- Tuyên dương trước lớp",
  "- Giấy khen",
  "  của nhà trường",
  "",
  "1. Bước một",
  "3. Bước ba (giữ nguyên số)",
  "",
  "4. Bước bốn sau dòng trống",
  "",
  "| Mức | Nội dung |",
  "|---|---|",
  "| 1 | Nhắc nhở |",
  "| 2 | Khiển trách |",
  "",
  "> Ghi chú: nội dung minh họa.",
  "> Dòng tiếp của ghi chú.",
  "",
  "## CHƯƠNG II. TỔ CHỨC THỰC HIỆN",
  "### Điều 3. Hiệu lực",
  "Có hiệu lực từ ngày ký.",
].join("\n");

const kinds = (blocks: RegulationBlock[]) => blocks.map((b) => b.kind);

describe("parseRegulation – blocks", () => {
  const { blocks, toc, articleCount } = parseRegulation(SAMPLE);

  it("produces every block kind in document order", () => {
    expect(kinds(blocks)).toEqual([
      "chapter",
      "article",
      "paragraph",
      "paragraph",
      "article",
      "list",
      "list",
      "table",
      "note",
      "chapter",
      "article",
      "paragraph",
    ]);
    expect(articleCount).toBe(3);
  });

  it("joins consecutive lines into one paragraph and keeps **bold** for the inline pass", () => {
    expect(blocks[2]).toEqual({ kind: "paragraph", text: "Văn bản mẫu dùng để kiểm thử, dòng này nối vào cùng đoạn." });
    expect(blocks[3]).toEqual({ kind: "paragraph", text: "Đoạn thứ hai có **chữ đậm** ở giữa." });
  });

  it("keeps bullets apart from numbered items, continues an item and keeps the written numbers", () => {
    expect(blocks[5]).toEqual({
      kind: "list",
      ordered: false,
      items: [
        { marker: "", text: "Tuyên dương trước lớp" },
        { marker: "", text: "Giấy khen của nhà trường" },
      ],
    });
    expect(blocks[6]).toEqual({
      kind: "list",
      ordered: true,
      items: [
        { marker: "1.", text: "Bước một" },
        { marker: "3.", text: "Bước ba (giữ nguyên số)" },
        { marker: "4.", text: "Bước bốn sau dòng trống" },
      ],
    });
  });

  it("reads a table with its separator row", () => {
    expect(blocks[7]).toEqual({
      kind: "table",
      head: ["Mức", "Nội dung"],
      rows: [
        ["1", "Nhắc nhở"],
        ["2", "Khiển trách"],
      ],
    });
  });

  it("joins note lines", () => {
    expect(blocks[8]).toEqual({ kind: "note", paragraphs: ["Ghi chú: nội dung minh họa. Dòng tiếp của ghi chú."] });
  });

  it("builds the table of contents: chapters with their articles", () => {
    expect(toc).toEqual([
      {
        id: "chuong-i",
        label: "CHƯƠNG I. QUY ĐỊNH CHUNG",
        kind: "chapter",
        children: [
          { id: "dieu-1", label: "Điều 1. Phạm vi áp dụng", kind: "article", children: [] },
          { id: "dieu-2", label: "Điều 2. Hình thức", kind: "article", children: [] },
        ],
      },
      {
        id: "chuong-ii",
        label: "CHƯƠNG II. TỔ CHỨC THỰC HIỆN",
        kind: "chapter",
        children: [{ id: "dieu-3", label: "Điều 3. Hiệu lực", kind: "article", children: [] }],
      },
    ]);
    expect(blocks[1]).toEqual({ kind: "article", id: "dieu-1", text: "Điều 1. Phạm vi áp dụng" });
  });

  it("is deterministic (same body → same blocks and anchors)", () => {
    expect(parseRegulation(SAMPLE)).toEqual(parseRegulation(SAMPLE));
  });
});

describe("parseRegulation – tolerance", () => {
  it("accepts CRLF / CR line ends, tabs and runs of blank lines", () => {
    const lf = parseRegulation(SAMPLE);
    expect(parseRegulation(SAMPLE.replace(/\n/g, "\r\n"))).toEqual(lf);
    expect(parseRegulation(SAMPLE.replace(/\n/g, "\r"))).toEqual(lf);
    expect(parseRegulation(`\n\n\n${SAMPLE.replace(/\n\n/g, "\n\n\n\n")}\n\n`)).toEqual(lf);
    expect(parseRegulation("###\tĐiều 9.\tTab   ").blocks).toEqual([{ kind: "article", id: "dieu-9", text: "Điều 9. Tab" }]);
  });

  it("reads a table without separator row (first row = header) and pads ragged rows", () => {
    const { blocks } = parseRegulation("| TT | Hình thức | Ghi chú\n| 1 | Nhắc nhở\n| 2 | Cảnh cáo | x | thừa |");
    expect(blocks).toEqual([
      {
        kind: "table",
        head: ["TT", "Hình thức", "Ghi chú", ""],
        rows: [
          ["1", "Nhắc nhở", "", ""],
          ["2", "Cảnh cáo", "x", "thừa"],
        ],
      },
    ]);
  });

  it("splits table cells (outer pipes optional, escaped pipe kept)", () => {
    expect(splitTableRow("| a | b \\| c |")).toEqual(["a", "b | c"]);
    expect(splitTableRow("|a|b")).toEqual(["a", "b"]);
    expect(splitTableRow("| :--- | ---: |")).toEqual([":---", "---:"]);
  });

  it("a blank line ends a table; text after it is a paragraph", () => {
    const { blocks } = parseRegulation("| A | B |\n| 1 | 2 |\n\n| C |\nSau bảng");
    expect(kinds(blocks)).toEqual(["table", "table", "paragraph"]);
  });

  it("accepts other bullet marks and numbering styles", () => {
    const { blocks } = parseRegulation("– gạch ngang\n• chấm tròn\n* sao\n\n1) một\n1.2. mục con");
    expect(blocks).toEqual([
      {
        kind: "list",
        ordered: false,
        items: [
          { marker: "", text: "gạch ngang" },
          { marker: "", text: "chấm tròn" },
          { marker: "", text: "sao" },
        ],
      },
      {
        kind: "list",
        ordered: true,
        items: [
          { marker: "1)", text: "một" },
          { marker: "1.2.", text: "mục con" },
        ],
      },
    ]);
  });

  it("does not take numbers, years or bold text for list markers", () => {
    const { blocks } = parseRegulation("2.5 điểm mỗi lần\n\n2026. Năm học\n\n**Đậm** đầu dòng\n\n-5 điểm");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph", "paragraph", "paragraph"]);
  });

  it("lets a heading, list item, table row or note interrupt a paragraph", () => {
    const { blocks } = parseRegulation("Mở đầu\n- mục\nĐoạn\n> chú ý\nThêm ý\n### Điều 4\nCuối\n| a |");
    expect(kinds(blocks)).toEqual(["paragraph", "list", "note", "article", "paragraph", "table"]);
    // "Đoạn" continues the list item, "Thêm ý" continues the note (Markdown lazy continuation).
    expect(blocks[1]).toMatchObject({ items: [{ text: "mục Đoạn" }] });
    expect(blocks[2]).toEqual({ kind: "note", paragraphs: ["chú ý Thêm ý"] });
  });

  it("splits a note on an empty '>' line and drops empty notes", () => {
    expect(parseRegulation("> một\n>\n> hai").blocks).toEqual([{ kind: "note", paragraphs: ["một", "hai"] }]);
    expect(parseRegulation(">\n>").blocks).toEqual([]);
  });

  it("maps # to a chapter, #### to an article and strips closing hashes", () => {
    const { blocks, toc } = parseRegulation("# Phần I ##\n#### Mục 2");
    expect(blocks).toEqual([
      { kind: "chapter", id: "phan-i", text: "Phần I" },
      { kind: "article", id: "muc-2", text: "Mục 2" },
    ]);
    expect(toc[0].children.map((c) => c.id)).toEqual(["muc-2"]);
  });

  it("puts articles before the first chapter at the top level", () => {
    const { toc } = parseRegulation("### Điều 1. A\n## Chương I\n### Điều 2. B");
    expect(toc.map((t) => [t.id, t.children.length])).toEqual([
      ["dieu-1", 0],
      ["chuong-i", 1],
    ]);
  });

  it("handles empty, blank and missing bodies", () => {
    for (const body of ["", "   \n\t\n", null, undefined]) {
      expect(parseRegulation(body)).toEqual({ blocks: [], toc: [], articleCount: 0 });
      expect(hasRegulationContent(body)).toBe(false);
    }
    expect(hasRegulationContent(" x ")).toBe(true);
    expect(parseRegulation("|---|---|").blocks).toEqual([]);
  });
});

describe("anchors", () => {
  it("are short for numbered headings (Điều, Chương, Phần, Mục), whatever the title or case", () => {
    const { toc } = parseRegulation("## CHƯƠNG IV. KHEN THƯỞNG\n### ĐIỀU 12. Khen thưởng **đột xuất**\n### Điều 7a. Bổ sung");
    expect(toc[0].id).toBe("chuong-iv");
    expect(toc[0].children.map((c) => [c.id, c.label])).toEqual([
      ["dieu-12", "ĐIỀU 12. Khen thưởng đột xuất"],
      ["dieu-7a", "Điều 7a. Bổ sung"],
    ]);
  });

  it("slug other Vietnamese titles without diacritics (đ → d) and never take words for numbers", () => {
    const ids = parseRegulation("### Khen thưởng đột xuất\n### Mục đích\n### Điều khoản thi hành\n### Phần mở đầu\n### Chương mới").toc.map((t) => t.id);
    expect(ids).toEqual(["khen-thuong-dot-xuat", "muc-dich", "dieu-khoan-thi-hanh", "phan-mo-dau", "chuong-moi"]);
    expect(slugifyVN("Ưu tiên – Ơn nghĩa, Đoàn Đội!")).toBe("uu-tien-on-nghia-doan-doi");
  });

  it("are unique: repeats get -2, -3; empty slugs fall back to muc-N", () => {
    const ids = parseRegulation("### Điều 1. A\n### Điều 1. B\n### Điều 1. C\n### !!!\n### Muc 4").toc.map((t) => t.id);
    expect(ids).toEqual(["dieu-1", "dieu-1-2", "dieu-1-3", "muc-4", "muc-4-2"]);
  });

  it("cut long slugs at a word boundary", () => {
    const id = parseRegulation(`### ${"Quy định chi tiết về việc ghi nhận ".repeat(4)}`).toc[0].id;
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id.endsWith("-")).toBe(false);
    expect(id.startsWith("quy-dinh-chi-tiet")).toBe(true);
  });
});

describe("inline", () => {
  it("splits **bold** runs and keeps unpaired markers as text", () => {
    expect(parseInline("a **b** c **d**")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c ", bold: false },
      { text: "d", bold: true },
    ]);
    expect(parseInline("lẻ ** dấu")).toEqual([{ text: "lẻ ** dấu", bold: false }]);
    expect(parseInline("****")).toEqual([{ text: "****", bold: false }]);
    expect(parseInline("")).toEqual([]);
    expect(plainText("**Điều 1.** Phạm vi")).toBe("Điều 1. Phạm vi");
  });
});

describe("bullets under a numbered clause", () => {
  it("a bullet list right after a numbered item ending in ':' is nested; other lists are not", async () => {
    const { parseRegulation } = await import("../markup");
    const doc = parseRegulation("1. Trường hợp áp dụng: lần đầu.\n2. Danh mục lỗi:\n- Lỗi A.\n- Lỗi B.\n\n3. Xử lý:\n- Nhắc nhở.\n\nĐoạn văn.\n\n- Danh sách thường.");
    const lists = doc.blocks.filter((b) => b.kind === "list");
    expect(lists.map((b) => (b.kind === "list" ? [b.ordered, b.nested ?? false, b.items.length] : null))).toEqual([
      [true, false, 2],
      [false, true, 2],
      [true, false, 1],
      [false, true, 1],
      [false, false, 1],
    ]);
  });
});
