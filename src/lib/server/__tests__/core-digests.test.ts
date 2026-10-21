import { beforeAll, describe, expect, it } from "vitest";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import { DELETE as incidentDELETE } from "@/app/api/incidents/[id]/route";
import { defaultLevelConfig } from "../../constants";
import { addDays, compactDate, generateWeeks, mondayOf, todayVN } from "../../engine/dates";
import type { Incident, LevelId } from "../../types";
import { assertDigestSize } from "../digest-size";
import { rebuildAllDigests } from "../digests";
import { ApiError } from "../errors";
import { db } from "../firebase-admin";
import { formatCode } from "../ids";
import { loadReference, readCanonicalReference, saveReferenceParts } from "../reference";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-core-digests";
const date = addDays(todayVN(), -1);
let editor = "";
let admin = "";

const createInc = (classCode: string, d = date) =>
  callRoute<Incident>(incidentPOST, {
    method: "POST",
    url: "/api/incidents",
    token: editor,
    body: { levelId: "THCS", date: d, classCode, errorCode: "L02", scope: "Tập thể", studentIds: [] },
  });

describe("digests, reference and code helpers", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["6A01", "6A02"], students: [{ id: "G1", name: "Mai Anh", classCode: "6A01" }] });
    editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
  });

  it("loadReference falls back to defaults (config + generated weeks) when nothing is stored", async () => {
    const ref = await loadReference("TH" as LevelId);
    expect(ref.config).toEqual(defaultLevelConfig("TH"));
    expect(ref.classes).toEqual([]);
    expect(ref.weeks).toEqual(generateWeeks(ref.config.firstWeek, ref.config.semesters));
  });

  it("nextCode skips ids that already exist (legacy import without counter)", async () => {
    const legacyCode = formatCode("NN", date, 1);
    await db().collection("incidents").doc(`THCS_${legacyCode}`).set({ id: `THCS_${legacyCode}`, code: legacyCode, levelId: "THCS", legacy: true });
    const res = await createInc("6A01");
    expect(res.status).toBe(201);
    expect(res.body.code).toBe(formatCode("NN", date, 2));
    await db().collection("incidents").doc(`THCS_${legacyCode}`).delete();
  });

  it("rebuildAllDigests reproduces live digests, drops deleted and stale weeks", async () => {
    const lastWeek = addDays(mondayOf(date), -2);
    const a = (await createInc("6A01")).body;
    const b = (await createInc("6A02", lastWeek)).body;
    await callRoute(incidentDELETE, { method: "DELETE", url: "/x", params: { id: b.id }, token: admin, body: { reason: "Xóa thử nghiệm" } });

    const liveWeek = await getDoc<{ items: Incident[] }>("digests", `THCS__inc__${a.week}`);
    // corrupt the read model: wipe the live week, plant a stale week
    await db().collection("digests").doc(`THCS__inc__${a.week}`).delete();
    await db().collection("digests").doc("THCS__inc__2000-01-03").set({ levelId: "THCS", kind: "inc", week: "2000-01-03", items: [], updatedAt: "" });
    await db().collection("digests").doc("THCS__stu").delete();

    const v0 = await readVersion("THCS");
    const result = await rebuildAllDigests("THCS");
    expect(await readVersion("THCS")).toBe(v0 + 1);
    expect(result.students).toBe(1);
    const rebuilt = await getDoc<{ items: Incident[] }>("digests", `THCS__inc__${a.week}`);
    expect(rebuilt?.items.map((i) => i.id)).toEqual(liveWeek?.items.map((i) => i.id));
    expect(await getDoc("digests", "THCS__inc__2000-01-03")).toBeUndefined();
    expect(await getDoc("digests", `THCS__inc__${b.week}`)).toBeUndefined(); // only incident of that week is deleted
    expect((await getDoc<{ items: unknown[] }>("digests", "THCS__stu"))?.items).toHaveLength(1);
  });

  it("saveReferenceParts writes only diffs, deletes removed items and refreshes __ref", async () => {
    const before = await readCanonicalReference("THCS");
    const v0 = await readVersion("THCS");
    const next = await saveReferenceParts("THCS", {
      classes: [{ ...before.classes[0], homeroomTeacher: "Cô Thu" }],
    });
    expect(next.classes.map((c) => c.code)).toEqual(["6A01"]);
    expect(await readVersion("THCS")).toBe(v0 + 1);
    const classDocs = await db().collection("levels").doc("THCS").collection("classes").get();
    expect(classDocs.docs.map((d) => d.id)).toEqual(["6A01"]);
    const digest = await getDoc<{ classes: Array<{ code: string; homeroomTeacher?: string }> }>("digests", "THCS__ref");
    expect(digest?.classes).toEqual([expect.objectContaining({ code: "6A01", homeroomTeacher: "Cô Thu" })]);
  });

  it("assertDigestSize refuses documents above ~900 KB", () => {
    expect(() => assertDigestSize("x", { items: ["a".repeat(950_000)] })).toThrow(ApiError);
    expect(() => assertDigestSize("x", { items: ["a".repeat(1000)] })).not.toThrow();
  });

  it("counter doc tracks the last sequence", async () => {
    const counters = await listDocs<{ seq: number }>("counters");
    const today = counters.find((c) => c.__id === `NN_THCS_${compactDate(date)}`);
    expect(today?.seq).toBeGreaterThanOrEqual(3);
  });
});
