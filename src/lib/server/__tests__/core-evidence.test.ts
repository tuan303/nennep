import { beforeAll, describe, expect, it } from "vitest";
import { POST as evidencePOST } from "@/app/api/evidence/route";
import { GET as evidenceGET } from "@/app/api/evidence/[id]/route";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import type { ApiErrorBody } from "../../contract";
import { addDays, todayVN } from "../../engine/dates";
import type { AuditLog, Incident } from "../../types";
import { EVIDENCE_MAX_BYTES } from "../evidence";
import { callRoute, createTestUser, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-core-evidence";
const t = { editor: "", viewer: "", gvcnOther: "", thEditor: "" };

/** Fake JPEG: valid magic bytes + filler. */
function jpeg(size: number): Buffer {
  const b = Buffer.alloc(size, 0x41);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
}
const dataUrl = (buf: Buffer, mime = "image/jpeg") => `data:${mime};base64,${buf.toString("base64")}`;

describe("evidence upload/download", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["9A01"], students: [{ id: "E1", name: "Tạ Minh", classCode: "9A01" }] });
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcnOther = (await createTestUser({ uid: "gv-th", role: "GVCN", gvcnClasses: [{ levelId: "TH", classCode: "1A1" }] })).token;
    t.thEditor = (await createTestUser({ uid: "ed-th", role: "EDITOR", levels: ["TH"] })).token;
  });

  it("stores an image ≤ 700 KB, audits it and serves the bytes back with its content type", async () => {
    const img = jpeg(EVIDENCE_MAX_BYTES);
    const up = await callRoute<{ id: string }>(evidencePOST, {
      method: "POST",
      url: "/api/evidence",
      token: t.editor,
      body: { levelId: "THCS", dataUrl: dataUrl(img), fileName: "anh.jpg" },
    });
    expect(up.status).toBe(201);
    expect(up.body.id).toMatch(/^[A-Za-z0-9]{10,}$/);
    const logs = (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "UPLOAD_EVIDENCE");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entityId: up.body.id, levelId: "THCS", uid: "editor" });

    const got = await callRoute(evidenceGET, { url: `/api/evidence/${up.body.id}`, params: { id: up.body.id }, token: t.viewer });
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/jpeg");
    expect(got.headers.get("cache-control")).toContain("private");
    expect(got.bytes.equals(img)).toBe(true);

    // the id can be attached to an incident of the same level
    const inc = await callRoute<Incident>(incidentPOST, {
      method: "POST",
      url: "/api/incidents",
      token: t.editor,
      body: { levelId: "THCS", date: addDays(todayVN(), -1), classCode: "9A01", errorCode: "L01", scope: "Cá nhân", studentIds: ["E1"], photoIds: [up.body.id] },
    });
    expect(inc.status).toBe(201);
    expect(inc.body.photoIds).toEqual([up.body.id]);
  });

  it("rejects images over 700 KB, wrong types and fake image bytes (400)", async () => {
    const big = await callRoute<ApiErrorBody>(evidencePOST, {
      method: "POST",
      url: "/api/evidence",
      token: t.editor,
      body: { levelId: "THCS", dataUrl: dataUrl(jpeg(EVIDENCE_MAX_BYTES + 1)) },
    });
    expect(big.status).toBe(400);
    expect(big.body.error.message).toContain("700 KB");
    const gif = await callRoute<ApiErrorBody>(evidencePOST, {
      method: "POST",
      url: "/api/evidence",
      token: t.editor,
      body: { levelId: "THCS", dataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" },
    });
    expect(gif.status).toBe(400);
    const fake = await callRoute<ApiErrorBody>(evidencePOST, {
      method: "POST",
      url: "/api/evidence",
      token: t.editor,
      body: { levelId: "THCS", dataUrl: dataUrl(Buffer.from("<html>not an image</html>"), "image/png") },
    });
    expect(fake.status).toBe(400);
    expect((await listDocs("evidence")).length).toBe(1);
  });

  it("needs create permission + level access to upload, level access to read", async () => {
    const small = dataUrl(jpeg(1000));
    expect((await callRoute(evidencePOST, { method: "POST", url: "/x", token: t.viewer, body: { levelId: "THCS", dataUrl: small } })).status).toBe(403);
    expect((await callRoute(evidencePOST, { method: "POST", url: "/x", token: t.thEditor, body: { levelId: "THCS", dataUrl: small } })).status).toBe(403);

    const [doc] = await listDocs<{ levelId: string }>("evidence");
    expect((await callRoute(evidenceGET, { url: "/x", params: { id: doc.__id }, token: t.gvcnOther })).status).toBe(403);
    expect((await callRoute(evidenceGET, { url: "/x", params: { id: doc.__id } })).status).toBe(401);
    expect((await callRoute(evidenceGET, { url: "/x", params: { id: "missing123" }, token: t.viewer })).status).toBe(404);

    // photo ids must exist and belong to the incident's level
    const bad = await callRoute<ApiErrorBody>(incidentPOST, {
      method: "POST",
      url: "/api/incidents",
      token: t.editor,
      body: { levelId: "THCS", date: addDays(todayVN(), -1), classCode: "9A01", errorCode: "L02", scope: "Tập thể", photoIds: ["missing123"] },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain("Ảnh minh chứng");
  });
});
