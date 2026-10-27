/**
 * SSR smoke tests of the quy chế page (node environment, no DOM; effects do not run): the rendered body, the reader for
 * every role (only an unrestricted ADMIN gets "Sửa" / "Soạn nội dung"), loading / error / empty states and the editor.
 * Short fake content only – the real regulation text never lives in the repo.
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ROLES, hasPermission, type Permission } from "@/lib/constants";
import { parseRegulation } from "@/lib/regulations/markup";
import type { LevelId, Regulation, Role, UserProfile } from "@/lib/types";

const who = vi.hoisted(() => ({ role: "ADMIN" as string, levels: [] as string[] }));
const data = vi.hoisted(() => ({
  status: "ready" as string,
  error: undefined as string | undefined,
  items: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/quy-che/ky-luat",
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/client/session", async () => {
  const { hasPermission: can } = await import("@/lib/constants");
  const profile = () =>
    ({
      uid: "u1",
      email: "nguoi.dung@nshm.test",
      displayName: "Người Dùng Thử",
      role: who.role,
      levels: who.levels,
      gvcnClasses: [],
      active: true,
      createdAt: "2026-08-01T00:00:00Z",
    }) as unknown as UserProfile;
  return { useSession: () => ({ status: "signedIn", profile: profile(), can: (p: Permission) => can(profile(), p) }) };
});

vi.mock("../use-regulations", () => ({
  useRegulations: () => ({
    status: data.status,
    error: data.error,
    get: (id: string) => data.items[id],
    reloading: false,
    reload: async () => data.items,
    put: () => undefined,
  }),
}));

const { RegulationScreen } = await import("../regulation-screen");
const { RegulationEditor } = await import("../regulation-editor");
const { RegulationBody } = await import("../regulation-body");
const { RegulationSwitch } = await import("../regulation-reader");

const BODY = [
  "## CHƯƠNG I. QUY ĐỊNH CHUNG",
  "### Điều 1. Phạm vi",
  "Đoạn mẫu có **chữ đậm**.",
  "1. Mục một",
  "3. Mục ba",
  "- Gạch đầu dòng",
  "",
  "| TT | Hình thức | Thẩm quyền |",
  "| 1 | Nhắc nhở | GVCN |",
  "",
  "> Ghi chú mẫu.",
  "### Điều 2. Hiệu lực",
  "Từ ngày ký.",
].join("\n");

const REG: Regulation = {
  id: "ky-luat",
  title: "Quy chế kỷ luật thử nghiệm",
  schoolYear: "2026–2027",
  body: BODY,
  pdf: { name: "ban-goc-thu.pdf", size: 204_800, uploadedAt: "2026-10-21T07:05:00Z" },
  rev: 3,
  updatedAt: "2026-10-21T07:05:00Z",
  updatedBy: "quan.tri@nshm.test",
  updatedByName: "Quản Trị Thử",
};

function screen(role: Role, levels: LevelId[] = [], items: Record<string, unknown> = { "ky-luat": REG }, status = "ready", error?: string): string {
  who.role = role;
  who.levels = levels;
  data.items = items;
  data.status = status;
  data.error = error;
  return renderToStaticMarkup(h(RegulationScreen, { id: "ky-luat" }));
}

describe("RegulationBody", () => {
  const html = renderToStaticMarkup(h(RegulationBody, { blocks: parseRegulation(BODY).blocks }));

  it("renders chapters and articles with anchors", () => {
    expect(html).toMatch(/<h2 id="chuong-i"[^>]*>CHƯƠNG I\. QUY ĐỊNH CHUNG<\/h2>/);
    expect(html).toMatch(/<h3 id="dieu-1"[^>]*>Điều 1\. Phạm vi<\/h3>/);
    expect(html).toContain('id="dieu-2"');
    expect(html).toContain("scroll-mt-24");
  });

  it("keeps the written numbers, bullets, bold and notes", () => {
    expect(html).toContain(">1.</span>");
    expect(html).toContain(">3.</span>");
    expect(html).not.toContain(">2.</span>");
    expect(html).toContain("<ol");
    expect(html).toContain("<ul");
    expect(html).toContain('<strong class="font-semibold text-slate-900">chữ đậm</strong>');
    expect(html).toContain('role="note"');
    expect(html).toContain("Ghi chú mẫu.");
  });

  it("renders a table (and its phone cards from 3 columns)", () => {
    expect(html).toContain('<th scope="col"');
    expect(html).toContain(">Thẩm quyền</th>");
    expect(html).toContain("max-sm:hidden print:block");
    expect(html).toContain("<dt");
    expect(html).toContain("sm:hidden print:hidden");
  });

  it("omits anchors in the editor preview", () => {
    const preview = renderToStaticMarkup(h(RegulationBody, { blocks: parseRegulation(BODY).blocks, anchors: false }));
    expect(preview).not.toContain('id="dieu-1"');
  });
});

describe("RegulationScreen", () => {
  it("unrestricted ADMIN: header, switch, actions incl. Sửa, table of contents, document, print stylesheet", () => {
    const html = screen("ADMIN");
    for (const text of [
      "Toàn trường · Năm học 2026–2027",
      "Quy chế kỷ luật thử nghiệm",
      "Cập nhật lúc 21/10/2026 14:05 – Quản Trị Thử",
      'aria-label="Chọn quy chế"',
      'href="/quy-che/khen-thuong"',
      ">Sửa<",
      "Tải bản PDF gốc",
      ">In<",
      "Mục lục · 2 điều",
      'data-regulation-doc="ky-luat"',
      "Trường Ngôi Sao Hoàng Mai",
      "size: A4",
      "gap-5 print:block lg:grid-cols-[240px_minmax(0,1fr)]",
    ]) {
      expect(html, text).toContain(text);
    }
  });

  const readers: Array<[Role, LevelId[]]> = [...ROLES.filter((r) => r !== "ADMIN").map((r): [Role, LevelId[]] => [r, []]), ["ADMIN", ["THCS"]]];

  it.each(readers)("%s %j reads, prints and downloads but cannot edit", (role, levels) => {
    expect(hasPermission({ role, levels, active: true }, "regulations.manage")).toBe(false);
    const html = screen(role, levels);
    expect(html).toContain("Quy chế kỷ luật thử nghiệm");
    expect(html).toContain(">In<");
    expect(html).toContain("Tải bản PDF gốc");
    expect(html).not.toContain(">Sửa<");
  });

  it("empty: ADMIN gets 'Soạn nội dung', readers are asked to come back later", () => {
    const admin = screen("ADMIN", [], {});
    expect(admin).toContain("Chưa có nội dung quy chế");
    expect(admin).toContain("Soạn nội dung");
    expect(admin).toContain("Quy chế kỷ luật"); // default title
    expect(admin).not.toContain(">In<");
    const viewer = screen("VIEWER", [], {});
    expect(viewer).toContain("Vui lòng quay lại sau");
    expect(viewer).not.toContain("Soạn nội dung");
    const editor = screen("EDITOR", [], { "ky-luat": { ...REG, body: "" } });
    expect(editor).toContain("có thể tải bản PDF gốc");
    expect(editor).toContain("Tải bản PDF gốc");
  });

  it("loading and error states", () => {
    expect(screen("VIEWER", [], {}, "loading")).toContain("Đang tải quy chế…");
    const err = screen("VIEWER", [], {}, "error", "Không kết nối được máy chủ. Vui lòng thử lại.");
    expect(err).toContain("Chưa tải được quy chế");
    expect(err).toContain("Không kết nối được máy chủ. Vui lòng thử lại.");
    expect(err).toContain("Thử lại");
  });
});

describe("RegulationSwitch", () => {
  it("links both quy chế and marks the current one", () => {
    const html = renderToStaticMarkup(h(RegulationSwitch, { current: "khen-thuong" }));
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/quy-che\/khen-thuong"/);
    expect(html).toContain('href="/quy-che/ky-luat"');
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).toContain("data-print-hide");
  });
});

describe("RegulationEditor", () => {
  const noop = () => undefined;
  const reload = async () => undefined;

  it("edits an existing regulation: fields, markup help, preview, PDF block, Lưu / Hủy", () => {
    who.role = "ADMIN";
    const html = renderToStaticMarkup(h(RegulationEditor, { id: "ky-luat", regulation: REG, onSaved: noop, onClose: noop, onReload: reload }));
    for (const text of [
      "Sửa quy chế",
      "Tên quy chế",
      "Năm học",
      "Nội dung",
      "Cách định dạng nội dung",
      "### Điều 1. Phạm vi áp dụng",
      "Soạn thảo",
      "Xem trước",
      "· 2 điều",
      "File PDF gốc",
      "ban-goc-thu.pdf · 200 KB · tải lên 21/10/2026",
      "Thay file PDF",
      "Xóa file PDF",
      'accept=".pdf,application/pdf"',
      "tối đa 700 KB",
      ">Lưu<",
      ">Hủy<",
      "font-mono",
    ]) {
      expect(html, text).toContain(text);
    }
    // The preview never repeats the document's anchors.
    expect(html).not.toContain('id="dieu-1"');
  });

  it("composes a new one: default title and school year, PDF after the first save", () => {
    const html = renderToStaticMarkup(h(RegulationEditor, { id: "khen-thuong", regulation: undefined, onSaved: noop, onClose: noop, onReload: reload }));
    expect(html).toContain("Soạn nội dung quy chế");
    expect(html).toContain('value="Quy chế khen thưởng"');
    expect(html).toMatch(/value="\d{4}–\d{4}"/);
    expect(html).toContain("Lưu nội dung lần đầu");
    expect(html).not.toContain("Thay file PDF");
    expect(html).toContain("<details open");
  });
});
