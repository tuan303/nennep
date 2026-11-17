/** loadMailSettings (emulators): defaults when never saved, partial / older docs merged over them, 30 s cache + invalidation, fresh reads. */
import { beforeAll, describe, expect, it } from "vitest";
import { COL } from "../../firestore-paths";
import { db } from "../firebase-admin";
import { invalidateMailSettingsCache, loadMailSettings } from "../mail/settings";
import { setupTestProject } from "./helpers";

describe("loadMailSettings", () => {
  beforeAll(async () => {
    await setupTestProject("demo-test-mail-foundation");
    invalidateMailSettingsCache();
  });

  it("returns the defaults when the level has no settings doc", async () => {
    expect(await loadMailSettings("TH")).toEqual({
      levelId: "TH",
      notices: { enabled: false, incidents: true, rewards: true },
      report: { bgh: [], grades: {}, cc: [] },
      allowedDomains: [],
      rev: 0,
    });
  });

  it("merges a partial doc over the defaults and ignores malformed values", async () => {
    await db()
      .collection(COL.mailSettings)
      .doc("THCS")
      .set({ levelId: "THCS", notices: { enabled: true }, report: { bgh: ["bgh@example.edu.vn", 7], grades: { "6": ["to.khoi6@example.edu.vn"] } }, rev: 3, updatedBy: "admin@example.edu.vn" });
    expect(await loadMailSettings("THCS")).toEqual({
      levelId: "THCS",
      notices: { enabled: true, incidents: true, rewards: true },
      report: { bgh: ["bgh@example.edu.vn"], grades: { "6": ["to.khoi6@example.edu.vn"] }, cc: [] },
      allowedDomains: [],
      rev: 3,
      updatedBy: "admin@example.edu.vn",
    });
  });

  it("serves cached settings until invalidated", async () => {
    const ref = db().collection(COL.mailSettings).doc("THPT");
    await ref.set({ levelId: "THPT", notices: { enabled: false, incidents: true, rewards: true }, report: { bgh: [], grades: {}, cc: [] }, allowedDomains: [], rev: 1 });
    expect((await loadMailSettings("THPT")).rev).toBe(1);
    await ref.update({ rev: 2, allowedDomains: ["example.edu.vn"] });
    expect((await loadMailSettings("THPT")).rev).toBe(1);
    invalidateMailSettingsCache("THPT");
    expect(await loadMailSettings("THPT")).toMatchObject({ rev: 2, allowedDomains: ["example.edu.vn"] });
  });

  it("fresh: skips the cached entry, reads Firestore and refreshes the cache", async () => {
    const ref = db().collection(COL.mailSettings).doc("THPT");
    expect((await loadMailSettings("THPT")).rev).toBe(2);
    await ref.update({ rev: 3 });
    expect((await loadMailSettings("THPT")).rev).toBe(2);
    expect((await loadMailSettings("THPT", { fresh: true })).rev).toBe(3);
    expect((await loadMailSettings("THPT")).rev).toBe(3);
  });
});
