/**
 * SSR smoke tests of the provider-free settings components: they must render without throwing and show the
 * key Vietnamese copy / validation messages. (Screens that need Session/Data providers are covered by the libs.)
 */
import * as React from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "@/components/ui";
import { makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { CatalogCard } from "../catalog/catalog-card";
import { catalogColumns, type CatalogEditorApi } from "../catalog/catalog-columns";
import { GeneralCard, SemestersCard } from "../config/config-general";
import { RagCard } from "../config/config-rag";
import { RankingRulesCard, SlaCard, StudentAlertCard } from "../config/config-rules";
import { newCatalogRow, rowsFromCatalog, validateCatalogRows } from "../lib/catalog-edit";
import { draftFromConfig, validateConfigDraft } from "../lib/config-form";
import { SystemInfoCard } from "../maintenance/system-info-card";
import { CopyField } from "../shared/copy-field";
import { Notice, ServerErrors } from "../shared/notice";
import { SaveBar } from "../shared/save-bar";

// vitest's esbuild compiles TSX with the classic runtime (tsconfig keeps `jsx: preserve` for Next): expose React globally.
(globalThis as { React?: typeof React }).React = React;

const noop = () => undefined;

describe("settings components (SSR smoke)", () => {
  it("renders the config cards with live validation", () => {
    const ds = makeFixtureDataset();
    const base = draftFromConfig(ds.config);
    const draft = { ...base, ragYellow: 30, firstWeek: "2026-08-19" };
    const props = { draft, base, errors: validateConfigDraft(draft), set: noop };
    const html = renderToStaticMarkup(
      h(
        "div",
        null,
        h(GeneralCard, props),
        h(SemestersCard, props),
        h(RagCard, props),
        h(RankingRulesCard, { ...props, classes: ds.classes }),
        h(StudentAlertCard, props),
        h(SlaCard, props),
      ),
    );
    expect(html).toContain("Ngưỡng Đỏ phải lớn hơn ngưỡng Vàng.");
    expect(html).toContain("Dùng Thứ Hai 17/08/2026");
    expect(html).toContain("Mở Lịch tuần");
    expect(html).toContain("Phê duyệt ngưỡng cảnh báo");
    expect(html).toContain("VD: Khối 6 có 5 lớp → 5 lớp thuộc Top 90%.");
    expect(html).toContain("Cảnh báo đỏ");
  });

  it("renders the catalog table and phone card", () => {
    const ds = makeFixtureDataset();
    const added = newCatalogRow(rowsFromCatalog(ds.catalog));
    const rows = [added, ...rowsFromCatalog(ds.catalog)];
    const api: CatalogEditorApi = { update: noop, remove: noop, errors: validateCatalogRows(rows), categoryListId: "cats", disabled: false };
    const table = renderToStaticMarkup(h(DataTable<(typeof rows)[number]>, { columns: catalogColumns(api), rows, rowKey: (r) => r.key }));
    expect(table).toContain("Nhập nội dung lỗi.");
    expect(table).toContain("Không nộp sổ Nhật ký học tập");
    const card = renderToStaticMarkup(h(CatalogCard, { row: rows[1], api }));
    expect(card).toContain("2 điểm/HS");
    const newCard = renderToStaticMarkup(h(CatalogCard, { row: added, api }));
    expect(newCard).toContain("Bỏ dòng mới này");
  });

  it("renders shared pieces and the system info card", () => {
    const html = renderToStaticMarkup(
      h(
        "div",
        null,
        h(SaveBar, { dirty: true, saving: false, errorCount: 2, onSave: noop, onReset: noop }),
        h(SaveBar, { dirty: false, saving: false, onSave: noop, onReset: noop }),
        h(Notice, { tone: "warn", title: "Tiêu đề" }, "Nội dung"),
        h(ServerErrors, { messages: ["Lỗi A", "Lỗi B"] }),
        h(CopyField, { label: "Mật khẩu tạm", value: "Nshm-7Kq4-2734" }),
        h(SystemInfoCard, { ds: makeFixtureDataset() }),
      ),
    );
    expect(html).toContain("Còn 2 ô cần sửa trước khi lưu");
    expect(html.match(/Có thay đổi chưa lưu/g)).toHaveLength(1);
    expect(html).toContain("<li>Lỗi B</li>");
    expect(html).toContain("Nshm-7Kq4-2734");
    expect(html).toContain("Phiên bản dữ liệu");
  });
});
