/**
 * REQ_V2 §5.3 – Điểm thưởng 1–5 + required reason (≥ 5 chars), legacy values kept while unchanged, GVCN proposals
 * (`reward.propose`: own class only, status forced, `proposed: true`, evidence upload allowed), workbook warning.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as evidencePOST } from "@/app/api/evidence/route";
import { POST as commitPOST } from "@/app/api/imports/workbook/commit/route";
import { POST as previewPOST } from "@/app/api/imports/workbook/preview/route";
import { DELETE as rwDELETE, PATCH as rwPATCH } from "@/app/api/rewards/[id]/route";
import { POST as rewardPOST } from "@/app/api/rewards/route";
import type { ApiErrorBody, RewardCreateInput, WorkbookCommitResult, WorkbookPayload, WorkbookPreview } from "../../contract";
import { addDays, compactDate, todayVN } from "../../engine/dates";
import type { AuditLog, Reward } from "../../types";
import { REWARD_POINTS_SCALE_WARNING } from "../admin/workbook-rewards";
import { db } from "../firebase-admin";
import { REWARD_MSG } from "../rewards";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-v2-rewards";
const today = todayVN();
const yesterday = addDays(today, -1);
const t = { admin: "", editor: "", viewer: "", gvcn: "", gvcnTh: "" };

const body = (over: Partial<RewardCreateInput> = {}): RewardCreateInput => ({
  levelId: "THCS",
  date: yesterday,
  classCode: "6A01",
  points: 3,
  reason: "Lớp tích cực tham gia phong trào",
  ...over,
});
const create = (token: string, over: Partial<RewardCreateInput> = {}) =>
  callRoute<Reward & ApiErrorBody>(rewardPOST, { method: "POST", url: "/api/rewards", token, body: body(over) });
const patch = (token: string, id: string, b: Record<string, unknown>) =>
  callRoute<Reward & ApiErrorBody>(rwPATCH, { method: "PATCH", url: `/api/rewards/${id}`, token, params: { id }, body: b });
const audits = async (action: AuditLog["action"], entityId: string) => (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === action && a.entityId === entityId);

function jpeg(size: number): Buffer {
  const b = Buffer.alloc(size, 0x41);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
}

describe("rewards v2 (REQ_V2 §5.3)", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["6A01", "6A02", "7A01"] });
    await seedReference("TH", { classes: ["1A1"] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", displayName: "Nguyễn Văn A", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] })).token;
    t.gvcnTh = (await createTestUser({ uid: "gvcnTh", role: "GVCN", gvcnClasses: [{ levelId: "TH", classCode: "1A1" }] })).token;
  });

  it("new rewards: integer points 1–5 and a reason of at least 5 characters", async () => {
    const six = await create(t.editor, { points: 6 });
    expect(six.status).toBe(400);
    expect(six.body.error.message).toBe("Mức điểm cộng từ 1 đến 5");
    const half = await create(t.editor, { points: 2.5 });
    expect(half.status).toBe(400);
    expect(half.body.error.message).toBe("Mức điểm cộng là số nguyên từ 1 đến 5");
    expect((await create(t.editor, { points: 0 })).status).toBe(400);
    const short = await create(t.editor, { reason: "  Tốt  " });
    expect(short.status).toBe(400);
    expect(short.body.error.message).toBe("Nhập lý do cộng điểm (tối thiểu 5 ký tự)");
    expect((await create(t.editor, { reason: undefined as unknown as string })).status).toBe(400);
    for (const points of [1, 5]) {
      const ok = await create(t.editor, { points });
      expect(ok.status).toBe(201);
      expect(ok.body.points).toBe(points);
      expect("proposed" in ok.body).toBe(false);
    }
    expect((await create(t.viewer)).status).toBe(403);
  });

  it("edits: a legacy 10-point reward and a short legacy reason stay valid while unchanged; changed values follow the new rules", async () => {
    const r = (await create(t.admin, { status: "Đang xác minh" })).body;
    await db().collection("rewards").doc(r.id).update({ points: 10, reason: "Hay" });
    const kept = await patch(t.admin, r.id, { note: "Bổ sung minh chứng", points: 10, reason: "Hay" });
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({ points: 10, reason: "Hay", note: "Bổ sung minh chứng" });

    const badPoints = await patch(t.admin, r.id, { points: 8 });
    expect(badPoints.status).toBe(400);
    expect(badPoints.body.error.message).toBe(REWARD_MSG.pointLevels);
    expect(badPoints.body.error.message).toBe("Mức điểm cộng là số nguyên từ 1 đến 5 (mức cũ được giữ nếu không sửa).");
    expect((await patch(t.admin, r.id, { points: 4.5 })).body.error.message).toBe(REWARD_MSG.pointLevels);
    expect((await patch(t.admin, r.id, { points: 150 })).status).toBe(400);

    const badReason = await patch(t.admin, r.id, { reason: "Ngắn" });
    expect(badReason.status).toBe(400);
    expect(badReason.body.error.message).toBe("Nhập lý do cộng điểm (tối thiểu 5 ký tự).");

    const fixed = await patch(t.admin, r.id, { points: 4, reason: "Lý do cộng điểm đầy đủ" });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ points: 4, reason: "Lý do cộng điểm đầy đủ" });
    const changes = (await audits("UPDATE_REWARD", r.id)).map((a) => (a.detail as { changes: Record<string, unknown> }).changes);
    expect(changes.some((c) => "points" in c && "reason" in c)).toBe(true);
  });

  it("GVCN proposes for the own class only: status forced to 'Mới ghi nhận', proposed = true, audited", async () => {
    const res = await create(t.gvcn, { status: "Đã xác nhận", points: 2, note: "Đề xuất của GVCN" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ classCode: "6A01", status: "Mới ghi nhận", proposed: true, points: 2, createdBy: "gvcn", reporter: "Nguyễn Văn A" });
    expect((await getDoc<Reward>("rewards", res.body.id))?.proposed).toBe(true);
    expect((await audits("CREATE_REWARD", res.body.id))[0].detail).toMatchObject({ proposed: true, status: "Mới ghi nhận" });

    const verifying = await create(t.gvcn, { status: "Đang xác minh" });
    expect(verifying.body.status).toBe("Mới ghi nhận");

    const other = await create(t.gvcn, { classCode: "6A02" });
    expect(other.status).toBe(403);
    expect(other.body.error.message).toBe("GVCN chỉ được đề xuất điểm thưởng cho lớp mình chủ nhiệm.");
    expect((await create(t.gvcnTh)).status).toBe(403);
    // The 1–5 / reason rules apply to proposals too.
    expect((await create(t.gvcn, { points: 7 })).status).toBe(400);
  });

  it("GVCN cannot edit or delete (even own proposals); ADMIN verifies a proposal and the flag stays", async () => {
    const p = (await create(t.gvcn)).body;
    expect((await patch(t.gvcn, p.id, { note: "Sửa" })).status).toBe(403);
    expect((await callRoute(rwDELETE, { method: "DELETE", url: "/x", params: { id: p.id }, token: t.gvcn, body: { reason: "Không cần" } })).status).toBe(403);
    const verified = await patch(t.admin, p.id, { status: "Đã xác nhận" });
    expect(verified.status).toBe(200);
    expect(verified.body).toMatchObject({ status: "Đã xác nhận", proposed: true });
  });

  it("GVCN may upload evidence for a proposal (own level) and attach it", async () => {
    const up = await callRoute<{ id: string } & ApiErrorBody>(evidencePOST, {
      method: "POST",
      url: "/api/evidence",
      token: t.gvcn,
      body: { levelId: "THCS", dataUrl: `data:image/jpeg;base64,${jpeg(2048).toString("base64")}` },
    });
    expect(up.status).toBe(201);
    const other = await callRoute(evidencePOST, {
      method: "POST",
      url: "/api/evidence",
      token: t.gvcn,
      body: { levelId: "TH", dataUrl: `data:image/jpeg;base64,${jpeg(2048).toString("base64")}` },
    });
    expect(other.status).toBe(403);
    expect((await callRoute(evidencePOST, { method: "POST", url: "/x", token: t.viewer, body: { levelId: "THCS", dataUrl: "data:image/jpeg;base64,/9j/" } })).status).toBe(403);
    const r = await create(t.gvcn, { photoIds: [up.body.id] });
    expect(r.status).toBe(201);
    expect(r.body.photoIds).toEqual([up.body.id]);
    expect((await getDoc<{ attachedTo?: string }>("evidence", up.body.id))?.attachedTo).toBe(r.body.id);
  });

  it("workbook import keeps legacy points outside 1–5 with a WARNING", async () => {
    const kt = (n: number) => `KT-${compactDate(yesterday)}-${String(900 + n).padStart(4, "0")}`;
    const payload: WorkbookPayload = {
      levelId: "THCS",
      sourceFileName: "so-diem-thuong.xlsx",
      classes: [],
      catalog: [],
      weeks: [],
      students: [],
      incidents: [],
      links: [],
      rewards: [
        { rowNumber: 3, code: kt(1), date: yesterday, classCode: "6A01", reason: "Giải nhất hội diễn", points: 10, status: "Đã xác nhận" },
        { rowNumber: 4, code: kt(2), date: yesterday, classCode: "6A02", reason: "Lớp sạch đẹp", points: 3 },
      ],
    };
    const pv = await callRoute<WorkbookPreview>(previewPOST, { method: "POST", url: "/api/imports/workbook/preview", token: t.admin, body: { payload } });
    expect(pv.status).toBe(200);
    expect(pv.body.issues.filter((i) => i.sheet === "Điểm thưởng").map((i) => [i.key, i.severity, i.messages])).toEqual([[kt(1), "WARNING", [REWARD_POINTS_SCALE_WARNING]]]);
    expect(REWARD_POINTS_SCALE_WARNING).toBe("Mức điểm cộng ngoài thang 1–5 (giữ theo file).");
    const commit = await callRoute<WorkbookCommitResult>(commitPOST, {
      method: "POST",
      url: "/api/imports/workbook/commit",
      token: t.admin,
      body: { payload, previewHash: pv.body.previewHash },
    });
    expect(commit.status).toBe(200);
    expect((await getDoc<Reward>("rewards", `THCS_${kt(1)}`))?.points).toBe(10);
    // Re-importing the identical file writes nothing and repeats no warning.
    const again = await callRoute<WorkbookPreview>(previewPOST, { method: "POST", url: "/api/imports/workbook/preview", token: t.admin, body: { payload } });
    expect(again.body.issues.filter((i) => i.sheet === "Điểm thưởng")).toEqual([]);
  });
});
