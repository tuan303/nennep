/**
 * Server-render smoke tests of the presentational pieces of the entry form (no providers needed).
 * Vitest compiles JSX with the classic runtime, so React is exposed globally for the components.
 */
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { EntryActionBar } from "../action-bar";
import { ErrorMeta } from "../error-meta";
import { FormStep } from "../form-step";
import { newEntryForm, type EntryForm } from "../lib/form-model";
import { computeEntryPreview } from "../lib/preview";
import { PointsPreview } from "../points-preview";

Object.assign(globalThis, { React });

const ds = makeFixtureDataset();
const h = React.createElement;
const preview = (patch: Partial<EntryForm>) => computeEntryPreview(ds, { ...newEntryForm({ today: FIXTURE_TODAY }), ...patch }, FIXTURE_TODAY);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("entry form pieces render", () => {
  it("points preview: ready to save with the formula", () => {
    const p = preview({ classCode: "6A01", errorCode: "L01", studentIds: ["26060101", "26060102", "26060103"] });
    const out = text(renderToStaticMarkup(h(PointsPreview, { preview: p, scope: "Cá nhân", classCode: "6A01" })));
    expect(out).toContain("6 điểm trừ");
    expect(out).toContain("2 điểm × 3 HS = 6");
    expect(out).toContain("Sẵn sàng lưu · Lớp 6A01 · Cá nhân · 3 HS liên quan");
  });

  it("points preview: lists blocking reasons and the unnamed flag", () => {
    const blocked = text(renderToStaticMarkup(h(PointsPreview, { preview: preview({ classCode: "6A01", errorCode: "L01" }), scope: "Cá nhân", classCode: "6A01", attempted: true })));
    expect(blocked).toContain("Cần hoàn tất trước khi lưu");
    expect(blocked).toContain("Phạm vi Cá nhân phải chọn học sinh liên quan.");
    const unnamed = preview({ classCode: "6A01", errorCode: "L01", scope: "Tập thể", unnamedCount: 2 });
    expect(text(renderToStaticMarkup(h(PointsPreview, { preview: unnamed, scope: "Tập thể", classCode: "6A01" })))).toContain("Thiếu tên HS");
  });

  it("action bar shows the first reason or the points", () => {
    const base = { mode: "create" as const, saving: null, uploading: false, onSave: () => {}, onSaveNext: () => {}, onCancelEdit: () => {}, previewId: "p" };
    const blocked = text(renderToStaticMarkup(h(EntryActionBar, { ...base, preview: preview({}) })));
    expect(blocked).toContain("Chưa thể lưu: Chọn lớp.");
    expect(blocked).toContain("Lưu & nhập tiếp");
    expect(renderToStaticMarkup(h(EntryActionBar, { ...base, preview: preview({}) }))).toContain(' disabled=""');
    const ok = renderToStaticMarkup(h(EntryActionBar, { ...base, preview: preview({ classCode: "7A01", errorCode: "L10", scope: "Tập thể" }) }));
    expect(text(ok)).toContain("5 điểm trừ");
    expect(ok).not.toContain(' disabled=""');
    const edit = text(renderToStaticMarkup(h(EntryActionBar, { ...base, mode: "edit", preview: preview({}) })));
    expect(edit).toContain("Cập nhật");
    expect(edit).toContain("Hủy sửa");
  });

  it("error metadata strip and numbered step", () => {
    const meta = text(renderToStaticMarkup(h(ErrorMeta, { item: ds.catalog[0] })));
    expect(meta).toContain("Mảng: Chuyên cần – vệ sinh");
    expect(meta).toContain("Mức trừ: 2 điểm");
    expect(meta).toContain("/HS – theo số học sinh");
    const step = renderToStaticMarkup(h(FormStep, { n: 3, title: "Phạm vi", children: "x" }));
    expect(text(step)).toContain("Bước 3: Phạm vi");
  });
});
