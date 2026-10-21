/** REQ_V2 §7.5: who may write the biện pháp khắc phục, feedback payloads, "không trùng" codes and the section render. */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2_FIXTURE_IDS, makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import type { Incident, UserProfile } from "@/lib/types";
import { RemediationSection, RemediationView } from "../incident-remediation";
import { canRemediate, feedbackRights } from "../lib/incident-access";
import { appendPhrase, codeOfIncidentId, feedbackChanges, notDuplicateCodes, remediationMeta } from "../lib/remediation";

function profile(over: Partial<UserProfile>): UserProfile {
  return { uid: "u1", email: "a@x.vn", displayName: "A", role: "EDITOR", levels: [], gvcnClasses: [], active: true, createdAt: "2026-08-01T00:00:00.000Z", ...over };
}

const ds = makeV2FixtureDataset();
const base: Incident = ds.incidents.find((i) => i.classCode === "6A01") ?? ds.incidents[0];
const deleted = { ...base, deletedAt: "2026-10-20T00:00:00Z" };
const gvcn = profile({ role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: base.classCode }] });
const otherGvcn = profile({ role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "7A03" }] });

describe("canRemediate", () => {
  it("allows ADMIN, EDITOR (incident.remediate + level) and the class GVCN", () => {
    expect(canRemediate(profile({ role: "ADMIN" }), base)).toBe(true);
    expect(canRemediate(profile({ role: "EDITOR" }), base)).toBe(true);
    expect(canRemediate(profile({ role: "EDITOR", levels: ["THCS"] }), base)).toBe(true);
    expect(canRemediate(gvcn, base)).toBe(true);
  });

  it("refuses viewers, other GVCN, other levels, inactive users, deleted and redacted incidents", () => {
    expect(canRemediate(profile({ role: "VIEWER" }), base)).toBe(false);
    expect(canRemediate(otherGvcn, base)).toBe(false);
    expect(canRemediate(profile({ role: "EDITOR", levels: ["TH"] }), base)).toBe(false);
    expect(canRemediate(profile({ role: "ADMIN", levels: ["THPT"] }), base)).toBe(false);
    expect(canRemediate(profile({ role: "EDITOR", active: false }), base)).toBe(false);
    expect(canRemediate(profile({ role: "ADMIN" }), deleted)).toBe(false);
    expect(canRemediate(profile({ role: "ADMIN" }), base, { redacted: true })).toBe(false);
    expect(canRemediate(undefined, base)).toBe(false);
  });
});

describe("feedbackRights", () => {
  it("ADMIN and the class GVCN: note + status + remediation; EDITOR: remediation + status", () => {
    expect(feedbackRights(profile({ role: "ADMIN" }), base)).toEqual({ note: true, status: true, remediation: true });
    expect(feedbackRights(gvcn, base)).toEqual({ note: true, status: true, remediation: true });
    expect(feedbackRights(profile({ role: "EDITOR" }), base)).toEqual({ note: false, status: true, remediation: true });
  });

  it("gives nothing to viewers / other GVCN, and nothing on redacted incidents", () => {
    expect(feedbackRights(profile({ role: "VIEWER" }), base)).toEqual({ note: false, status: false, remediation: false });
    expect(feedbackRights(otherGvcn, base)).toEqual({ note: false, status: false, remediation: false });
    expect(feedbackRights(gvcn, base, { redacted: true })).toEqual({ note: false, status: false, remediation: false });
  });
});

describe("feedbackChanges", () => {
  const stored = { gvcnNote: "Đã nhắc nhở", status: "Mới ghi nhận" as const, remediation: "Lao động vệ sinh" };
  const all = { note: true, status: true, remediation: true };

  it("returns null when nothing changed (whitespace ignored)", () => {
    expect(feedbackChanges(stored, { note: " Đã nhắc nhở ", status: "Mới ghi nhận", remediation: "Lao động vệ sinh  " }, all)).toBeNull();
  });

  it("sends only changed, allowed fields (trimmed; '' clears)", () => {
    expect(feedbackChanges(stored, { note: "Đã nhắc nhở", status: "Đã đóng", remediation: " Viết cam kết " }, all)).toEqual({
      status: "Đã đóng",
      remediation: "Viết cam kết",
    });
    expect(feedbackChanges(stored, { note: "Mới", status: "Mới ghi nhận", remediation: "" }, all)).toEqual({ note: "Mới", remediation: "" });
    // EDITOR: a changed note is never sent (the server would answer 403).
    expect(feedbackChanges(stored, { note: "Khác", status: "Đang xử lý", remediation: "Lao động vệ sinh" }, { note: false, status: true, remediation: true })).toEqual({
      status: "Đang xử lý",
    });
    expect(feedbackChanges({ status: "Đang xử lý" }, { remediation: "", status: "Đang xử lý" })).toBeNull();
  });
});

describe("texts", () => {
  it("formats who changed the remediation and when (VN time)", () => {
    expect(remediationMeta({ remediationBy: "Lê Thị C", remediationAt: "2026-10-21T03:05:00.000Z" })).toBe("Lê Thị C · 21/10/2026 10:05");
    expect(remediationMeta({})).toBe("");
  });

  it("appends quick phrases once", () => {
    expect(appendPhrase("", "Trao đổi với phụ huynh.")).toBe("Trao đổi với phụ huynh.");
    expect(appendPhrase("Nhắc nhở.", "Trao đổi với phụ huynh.")).toBe("Nhắc nhở. Trao đổi với phụ huynh.");
    expect(appendPhrase("Nhắc nhở. Trao đổi với phụ huynh.", "Trao đổi với phụ huynh.")).toBe("Nhắc nhở. Trao đổi với phụ huynh.");
  });

  it("maps doc ids to codes and lists reviewed pairs from both sides", () => {
    expect(codeOfIncidentId("THCS_NN-20990101-0001")).toBe("NN-20990101-0001");
    expect(codeOfIncidentId(V2_FIXTURE_IDS.reviewedOf, ds.incidents)).toBe("NN-20260910-0001");
    const reviewed = ds.incidents.find((i) => i.id === V2_FIXTURE_IDS.reviewed);
    const reviewedOf = ds.incidents.find((i) => i.id === V2_FIXTURE_IDS.reviewedOf);
    if (!reviewed || !reviewedOf) throw new Error("fixture incidents missing");
    expect(notDuplicateCodes(reviewed, ds.incidents)).toEqual([reviewedOf.code]);
    // The other side holds no mark itself but is listed by `reviewed`.
    expect(reviewedOf.notDuplicateOf ?? []).toEqual([]);
    expect(notDuplicateCodes(reviewedOf, ds.incidents)).toEqual([reviewed.code]);
    expect(notDuplicateCodes(base, ds.incidents)).toEqual([]);
  });
});

describe("remediation section render", () => {
  const fixed: Incident = { ...base, remediation: "Học sinh viết bản cam kết.", remediationBy: "Lê Thị C", remediationAt: "2026-10-21T03:05:00.000Z" };

  it("shows the stored remediation with its author", () => {
    const html = renderToStaticMarkup(h(RemediationView, { incident: fixed }));
    expect(html).toContain("Học sinh viết bản cam kết.");
    expect(html).toContain("Lê Thị C · 21/10/2026 10:05");
    expect(renderToStaticMarkup(h(RemediationView, { incident: base }))).toContain("Chưa có biện pháp khắc phục.");
  });

  it("offers the editor only to allowed users", () => {
    const allowed = renderToStaticMarkup(h(RemediationSection, { incident: base, canEdit: true, onSaved: () => undefined }));
    expect(allowed).toContain("Ghi biện pháp khắc phục");
    const update = renderToStaticMarkup(h(RemediationSection, { incident: fixed, canEdit: true, onSaved: () => undefined }));
    expect(update).toContain("Cập nhật biện pháp khắc phục");
    const viewer = renderToStaticMarkup(h(RemediationSection, { incident: fixed, canEdit: false, onSaved: () => undefined }));
    expect(viewer).not.toContain("Cập nhật biện pháp khắc phục");
    expect(viewer).toContain("Học sinh viết bản cam kết.");
  });
});
