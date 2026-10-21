import { beforeAll, describe, expect, it } from "vitest";
import { POST as createPOST } from "@/app/api/incidents/route";
import type { IncidentCreateInput } from "../../contract";
import { addDays, compactDate, mondayOf, todayVN } from "../../engine/dates";
import type { AuditLog, Incident } from "../../types";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-core-concurrency";
const N = 20;

describe("AC-018 concurrent incident creation", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", {
      classes: ["6A01", "6A02"],
      students: [
        { id: "C1", name: "Vũ Anh", classCode: "6A01" },
        { id: "C2", name: "Bùi Bảo", classCode: "6A02" },
      ],
    });
  });

  it(`${N} simultaneous creates by 2 editors on the same day → ${N} distinct codes, no loss`, async () => {
    const date = addDays(todayVN(), -1);
    const [e1, e2] = await Promise.all([
      createTestUser({ uid: "ed-a", role: "EDITOR" }),
      createTestUser({ uid: "ed-b", role: "EDITOR" }),
    ]);
    const v0 = await readVersion("THCS");

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => {
        const body: IncidentCreateInput =
          i % 2 === 0
            ? { levelId: "THCS", date, classCode: "6A01", errorCode: "L01", scope: "Cá nhân", studentIds: ["C1"] }
            : { levelId: "THCS", date, classCode: "6A02", errorCode: "L02", scope: "Tập thể", studentIds: [] };
        return callRoute<Incident>(createPOST, { method: "POST", url: "/api/incidents", token: i % 2 === 0 ? e1.token : e2.token, body });
      }),
    );

    expect(results.map((r) => r.status)).toEqual(Array(N).fill(201));
    const codes = results.map((r) => r.body.code);
    expect(new Set(codes).size).toBe(N);
    const expected = Array.from({ length: N }, (_, i) => `NN-${compactDate(date)}-${String(i + 1).padStart(4, "0")}`);
    expect([...codes].sort()).toEqual(expected);

    const stored = await listDocs<Incident>("incidents");
    expect(stored).toHaveLength(N);
    const digest = await getDoc<{ items: Incident[] }>("digests", `THCS__inc__${mondayOf(date)}`);
    expect(digest?.items).toHaveLength(N);
    expect(digest?.items.map((i) => i.code)).toEqual(expected); // sorted by date then code
    expect(await getDoc<{ seq: number }>("counters", `NN_THCS_${compactDate(date)}`)).toMatchObject({ seq: N });
    expect(await readVersion("THCS")).toBe(v0 + N);
    expect((await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "CREATE_INCIDENT")).toHaveLength(N);
  });
});
