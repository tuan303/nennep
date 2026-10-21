import { beforeAll, describe, expect, it } from "vitest";
import { GET as auditGET } from "@/app/api/audit-logs/route";
import { POST as exportPOST } from "@/app/api/exports/log/route";
import type { ApiErrorBody, AuditLogPage } from "../../contract";
import type { AuditLog } from "../../types";
import { vnDayStartIso } from "../admin/audit-query";
import { writeAuditDirect } from "../audit";
import { callRoute, createTestUser, listDocs, setupTestProject } from "./helpers";

const PROJECT = "demo-test-admin-audit";
let admin = "";
let editor = "";

const query = (qs: string, token = admin) => callRoute<AuditLogPage & ApiErrorBody>(auditGET, { url: `/api/audit-logs?${qs}`, token });

/** 30 logs: ts = 2026-10-01T00:MM:00Z, LOGIN for a@ (even), EXPORT_EXCEL THCS for b@ (odd). */
async function seedLogs(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const odd = i % 2 === 1;
    await writeAuditDirect({
      ts: `2026-10-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      uid: odd ? "b" : "a",
      email: odd ? "b@nshm.test" : "a@nshm.test",
      role: "ADMIN",
      action: odd ? "EXPORT_EXCEL" : "LOGIN",
      levelId: odd ? "THCS" : undefined,
      detail: { i },
    });
  }
  // VN day boundary: 2026-10-20 23:59 (VN) and 2026-10-21 00:00 (VN)
  await writeAuditDirect({ ts: "2026-10-20T16:59:00.000Z", uid: "c", email: "c@nshm.test", role: "VIEWER", action: "LOGOUT", detail: { edge: "before" } });
  await writeAuditDirect({ ts: "2026-10-20T17:00:00.000Z", uid: "c", email: "c@nshm.test", role: "VIEWER", action: "LOGOUT", detail: { edge: "after" } });
}

describe("audit log query", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    await seedLogs();
  });

  it("pages newest first with a cursor until exhausted", async () => {
    const seen: AuditLog[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const res = await query(`limit=7${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      seen.push(...res.body.items);
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(seen).toHaveLength(32);
    expect(new Set(seen.map((l) => l.id)).size).toBe(32);
    const ts = seen.map((l) => l.ts);
    expect([...ts].sort().reverse()).toEqual(ts);
    expect(pages).toBe(5);
  });

  it("filters by action / email / level (one in Firestore, the rest in memory)", async () => {
    const exports = await query("action=EXPORT_EXCEL&limit=100");
    expect(exports.body.items).toHaveLength(15);
    expect(exports.body.items.every((l) => l.action === "EXPORT_EXCEL")).toBe(true);
    const combined = await query("email=B@NSHM.test&action=EXPORT_EXCEL&level=THCS&limit=4");
    expect(combined.body.items).toHaveLength(4);
    expect(combined.body.nextCursor).toBeTruthy();
    const next = await query(`email=b@nshm.test&action=EXPORT_EXCEL&level=THCS&limit=100&cursor=${combined.body.nextCursor}`);
    expect(next.body.items).toHaveLength(11);
    expect(next.body.nextCursor).toBeUndefined();
    expect((await query("email=a@nshm.test&action=EXPORT_EXCEL")).body.items).toHaveLength(0);
  });

  it("date range uses Vietnam calendar days", async () => {
    expect(vnDayStartIso("2026-10-21")).toBe("2026-10-20T17:00:00.000Z");
    const res = await query("from=2026-10-21&to=2026-10-21");
    expect(res.body.items.map((l) => l.detail?.edge)).toEqual(["after"]);
    const res2 = await query("from=2026-10-20&to=2026-10-20&action=LOGOUT");
    expect(res2.body.items.map((l) => l.detail?.edge)).toEqual(["before"]);
    expect((await query("from=2026-10-22&to=2026-10-21")).status).toBe(400);
  });

  it("validates parameters and requires audit.view", async () => {
    expect((await query("limit=101")).status).toBe(400);
    expect((await query("cursor=%%%bad")).status).toBe(400);
    expect((await query("limit=5", editor)).status).toBe(403);
  });

  it("exports/log writes EXPORT_EXCEL", async () => {
    const res = await callRoute(exportPOST, { method: "POST", url: "/api/exports/log", token: admin, body: { levelId: "THPT", kind: "ranking", detail: { period: "2026-10" } } });
    expect(res.status).toBe(200);
    const log = (await listDocs<AuditLog>("auditLogs")).find((l) => l.action === "EXPORT_EXCEL" && l.levelId === "THPT");
    expect(log).toMatchObject({ entityId: "ranking", email: "admin@nshm.test", detail: { kind: "ranking", period: "2026-10" } });
    expect((await callRoute(exportPOST, { method: "POST", url: "/api/exports/log", token: editor, body: { kind: "html" } })).status).toBe(403);
  });
});
