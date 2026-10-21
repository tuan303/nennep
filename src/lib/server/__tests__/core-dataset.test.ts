import { beforeAll, describe, expect, it } from "vitest";
import { GET as datasetGET } from "@/app/api/dataset/route";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import { POST as rewardPOST } from "@/app/api/rewards/route";
import { POST as feedbackPOST } from "@/app/api/incidents/[id]/feedback/route";
import type { ApiErrorBody } from "../../contract";
import { addDays, todayVN } from "../../engine/dates";
import type { Incident, LevelDataset, Reward } from "../../types";
import { buildLevelDataset, etagMatches } from "../dataset";
import { db } from "../firebase-admin";
import { readVersion } from "../versions";
import { callRoute, createTestUser, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-core-dataset";
const date = addDays(todayVN(), -1);
let admin = "";
let editor = "";
let viewer = "";
let gvcn = "";
let own: Incident;
let other: Incident;

describe("GET /api/dataset", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", {
      classes: ["8A01", "8A02"],
      students: [
        { id: "D1", name: "Ngô Thị Mai", classCode: "8A01" },
        { id: "D2", name: "Đinh Văn Nam", classCode: "8A02" },
        { id: "D3", name: "Lý Thu Hà", classCode: "8A02", status: "TRANSFERRED_OUT" },
      ],
    });
    await seedReference("TH", { classes: ["1A1"] });
    admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    editor = (await createTestUser({ uid: "editor", role: "EDITOR", displayName: "Thầy Long" })).token;
    viewer = (await createTestUser({ uid: "viewer", role: "VIEWER", levels: ["TH"] })).token;
    gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "8A01" }] })).token;

    const mk = (classCode: string, studentIds: string[], detail: string) =>
      callRoute<Incident>(incidentPOST, {
        method: "POST",
        url: "/api/incidents",
        token: editor,
        body: { levelId: "THCS", date, classCode, errorCode: "L01", scope: "Cá nhân", studentIds, detail, evidenceUrls: ["https://example.com/a.jpg"] },
      });
    own = (await mk("8A01", ["D1"], "Chi tiết lớp 8A01")).body;
    other = (await mk("8A02", ["D2"], "Chi tiết lớp 8A02")).body;
    await callRoute(feedbackPOST, { method: "POST", url: "/x", params: { id: other.id }, token: admin, body: { note: "Ghi chú GVCN 8A02" } });
    const rw = await callRoute<Reward>(rewardPOST, {
      method: "POST",
      url: "/api/rewards",
      token: admin,
      body: { levelId: "THCS", date, classCode: "8A02", points: 5, reason: "Đạt giải văn nghệ", note: "Ghi chú nội bộ", status: "Đã xác nhận" },
    });
    expect(rw.status).toBe(201);
  });

  it("returns the full dataset with a weak ETag of the level version", async () => {
    const version = await readVersion("THCS");
    const res = await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe(`W/"${version}"`);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    const ds = res.body;
    expect(ds).toMatchObject({ levelId: "THCS", version, redacted: false });
    expect(ds.classes.map((c) => c.code)).toEqual(["8A01", "8A02"]);
    expect(ds.catalog.length).toBeGreaterThan(0);
    expect(ds.weeks.length).toBeGreaterThan(0);
    expect(ds.students.map((s) => s.id).sort()).toEqual(["D1", "D2", "D3"]);
    expect(ds.incidents.map((i) => i.id)).toEqual([own.id, other.id]);
    expect(ds.rewards).toHaveLength(1);
    expect(ds.incidents[1].gvcnNote).toBe("Ghi chú GVCN 8A02");
  });

  it("answers 304 for a matching If-None-Match and 200 again after a write", async () => {
    const first = await callRoute(datasetGET, { url: "/api/dataset?level=THCS", token: admin });
    const etag = first.headers.get("etag") ?? "";
    const again = await callRoute(datasetGET, { url: "/api/dataset?level=THCS", token: admin, headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect(again.text).toBe("");
    expect(again.headers.get("etag")).toBe(etag);

    await callRoute(incidentPOST, {
      method: "POST",
      url: "/api/incidents",
      token: editor,
      body: { levelId: "THCS", date, classCode: "8A01", errorCode: "L02", scope: "Tập thể", studentIds: [] },
    });
    const after = await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: admin, headers: { "if-none-match": etag } });
    expect(after.status).toBe(200);
    expect(after.headers.get("etag")).not.toBe(etag);
    expect(after.body.incidents).toHaveLength(3);
  });

  it("GVCN gets own-class students only and redacted incidents/rewards of other classes", async () => {
    const res = await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: gvcn });
    expect(res.status).toBe(200);
    const ds = res.body;
    expect(ds.redacted).toBe(true);
    expect(ds.students.map((s) => s.id)).toEqual(["D1"]);
    const mine = ds.incidents.find((i) => i.id === own.id);
    expect(mine?.students).toEqual([{ id: "D1", name: "Ngô Thị Mai", classCode: "8A01" }]);
    expect(mine?.detail).toBe("Chi tiết lớp 8A01");
    const theirs = ds.incidents.find((i) => i.id === other.id) as Incident;
    expect(theirs).toMatchObject({ classCode: "8A02", errorCode: "L01", points: 2, date, students: [], evidenceUrls: [], photoIds: [], relatedStudentCount: 1 });
    expect(theirs.detail).toBeUndefined();
    expect(theirs.gvcnNote).toBeUndefined();
    expect(theirs.gvcnNoteBy).toBeUndefined();
    expect(theirs.reporter).toBeUndefined();
    expect(JSON.stringify(theirs)).not.toContain("Đinh Văn Nam");
    expect(ds.rewards[0]).toMatchObject({ classCode: "8A02", points: 5 });
    expect(ds.rewards[0].note).toBeUndefined();
  });

  it("enforces level access and validates the level parameter", async () => {
    const denied = await callRoute<ApiErrorBody>(datasetGET, { url: "/api/dataset?level=THCS", token: viewer });
    expect(denied.status).toBe(403);
    const gvcnOther = await callRoute(datasetGET, { url: "/api/dataset?level=TH", token: gvcn });
    expect(gvcnOther.status).toBe(403);
    const bad = await callRoute<ApiErrorBody>(datasetGET, { url: "/api/dataset?level=XYZ", token: admin });
    expect(bad.status).toBe(400);
    const th = await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=TH", token: viewer });
    expect(th.status).toBe(200);
    expect(th.body.incidents).toEqual([]);
  });

  it("falls back to canonical docs when digests are missing", async () => {
    await db().collection("digests").doc("THCS__stu").delete();
    await db().collection("digests").doc("THCS__rew").delete();
    await db().collection("digests").doc("THCS__ref").delete();
    const ds = await buildLevelDataset("THCS");
    expect(ds.students).toHaveLength(3);
    expect(ds.rewards).toHaveLength(1);
    expect(ds.classes.map((c) => c.code)).toEqual(["8A01", "8A02"]);
  });

  it("etagMatches accepts weak/strong/bare/list forms", () => {
    expect(etagMatches('W/"7"', 7)).toBe(true);
    expect(etagMatches('"7"', 7)).toBe(true);
    expect(etagMatches("7", 7)).toBe(true);
    expect(etagMatches('W/"6", W/"7"', 7)).toBe(true);
    expect(etagMatches('W/"6"', 7)).toBe(false);
    expect(etagMatches(null, 7)).toBe(false);
  });
});
