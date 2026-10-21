import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import type { AuditLog } from "@/lib/types";
import {
  AUDIT_EXPORT_COLUMNS,
  EMPTY_AUDIT_FORM,
  activeAuditFilterCount,
  applyLocalFilter,
  auditExportRows,
  auditFilterText,
  buildAuditFilter,
  countText,
  distinctEmails,
  filterKey,
  presetOf,
  presetRange,
} from "../lib/audit-query";

function log(over: Partial<AuditLog>): AuditLog {
  return { id: "a1", ts: "2026-10-21T02:05:00.000Z", uid: "u1", email: "admin@nshm.test", role: "ADMIN", action: "LOGIN", ...over };
}

describe("buildAuditFilter", () => {
  it("maps the form to the server query", () => {
    const r = buildAuditFilter({ action: "CREATE_INCIDENT", email: "  Admin@NSHM.test ", level: "THCS", from: "2026-10-01", to: "2026-10-21" });
    expect(r).toEqual({ filter: { query: { action: "CREATE_INCIDENT", email: "admin@nshm.test", level: "THCS", from: "2026-10-01", to: "2026-10-21" } } });
  });

  it("keeps a partial email local (server matches exact addresses)", () => {
    const r = buildAuditFilter({ ...EMPTY_AUDIT_FORM, email: "nennep" });
    expect(r).toEqual({ filter: { query: {}, localEmail: "nennep" } });
  });

  it("validates the date range", () => {
    expect(buildAuditFilter({ ...EMPTY_AUDIT_FORM, from: "2026-10-22", to: "2026-10-21" })).toEqual({ error: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." });
    expect(buildAuditFilter({ ...EMPTY_AUDIT_FORM, from: "2026-13-01" })).toEqual({ error: "Ngày bắt đầu không hợp lệ." });
    expect(buildAuditFilter(EMPTY_AUDIT_FORM)).toEqual({ filter: { query: {} } });
  });

  it("filter key and count", () => {
    const a = buildAuditFilter({ ...EMPTY_AUDIT_FORM, level: "TH" });
    const b = buildAuditFilter({ ...EMPTY_AUDIT_FORM, level: "TH" });
    if (!("filter" in a) || !("filter" in b)) throw new Error("expected filters");
    expect(filterKey(a.filter)).toBe(filterKey(b.filter));
    expect(activeAuditFilterCount({ ...EMPTY_AUDIT_FORM, level: "TH", email: " x " })).toBe(2);
    expect(auditFilterText(a.filter)).toBe("Cấp học: Tiểu học");
    expect(auditFilterText({ query: { from: "2026-10-01" } })).toBe("Từ 01/10/2026 đến …");
    expect(auditFilterText({ query: {} })).toBe("Tất cả bản ghi");
  });
});

describe("local filtering, presets and counters", () => {
  const items = [log({ id: "1", email: "nennep@nshm.test" }), log({ id: "2", email: "admin@nshm.test" }), log({ id: "3", email: "nennep@nshm.test" })];

  it("applyLocalFilter matches part of the email", () => {
    expect(applyLocalFilter(items, { query: {}, localEmail: "NENNEP" }).map((l) => l.id)).toEqual(["1", "3"]);
    expect(applyLocalFilter(items, { query: {} })).toHaveLength(3);
    expect(distinctEmails(items)).toBe(2);
  });

  it("date presets", () => {
    expect(presetRange("today", FIXTURE_TODAY)).toEqual({ from: "2026-10-21", to: "2026-10-21" });
    expect(presetRange("week", FIXTURE_TODAY)).toEqual({ from: "2026-10-19", to: "2026-10-21" });
    expect(presetRange("7d", FIXTURE_TODAY)).toEqual({ from: "2026-10-15", to: "2026-10-21" });
    expect(presetRange("30d", FIXTURE_TODAY).from).toBe("2026-09-22");
    expect(presetOf({ from: "2026-10-15", to: "2026-10-21" }, FIXTURE_TODAY)).toBe("7d");
    expect(presetOf({ from: "", to: "" }, FIXTURE_TODAY)).toBeUndefined();
  });

  it("countText", () => {
    expect(countText(12, false)).toBe("12");
    expect(countText(100, true)).toBe("100+");
  });
});

describe("auditExportRows", () => {
  it("one row per log with every export column", () => {
    const rows = auditExportRows(
      [log({ action: "CREATE_INCIDENT", entity: "incident", entityId: "THCS_NN-1", levelId: "THCS", ip: "1.2.3.4", detail: { classCode: "6A01", errorCode: "L04", points: 6 } })],
      (iso) => `T(${iso})`,
    );
    expect(Object.keys(rows[0]).sort()).toEqual(AUDIT_EXPORT_COLUMNS.map((c) => c.key).sort());
    expect(rows[0]).toMatchObject({
      time: "T(2026-10-21T02:05:00.000Z)",
      role: "Quản trị",
      action: "Tạo sự việc",
      code: "CREATE_INCIDENT",
      entity: "Sự việc",
      level: "THCS",
      summary: "6A01 · L04 · 6 điểm",
      ip: "1.2.3.4",
    });
    expect(JSON.parse(String(rows[0].detail))).toEqual({ classCode: "6A01", errorCode: "L04", points: 6 });
    const anon = auditExportRows([log({ email: "", role: "", action: "LOGIN_FAILED" })], () => "");
    expect(anon[0]).toMatchObject({ email: null, role: "Chưa xác thực", detail: null, summary: null });
  });
});
