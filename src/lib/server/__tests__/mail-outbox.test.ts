/**
 * Outbox planning (pure, no emulators): which record changes become GVCN notices (CREATED / UPDATED / DELETED /
 * RESTORED / MOVED_OUT / CONFIRMED), snapshots, queued job shape, payload guards, mail-log labels, GVCN addresses.
 */
import { describe, expect, it } from "vitest";
import type { Incident, MailJob, Reward, RewardStatus, UserProfile } from "../../types";
import type { SessionUser } from "../auth";
import {
  incidentSnapshot,
  isNoticePayload,
  isReportPayload,
  isTestPayload,
  levelOfRecordId,
  mailJobLabel,
  noticeJob,
  planRecordNotices,
  rewardSnapshot,
  toMailJobView,
} from "../mail/outbox";
import { gvcnEmailsOfClass } from "../mail/recipients";

const COUNTED: RewardStatus[] = ["Đã xác nhận"];
const ctx = { actorName: "Cô Lan", countedStatuses: COUNTED };

const incident = (over: Partial<Incident> = {}): Incident => ({
  id: "THCS_NN-20261021-0001",
  code: "NN-20261021-0001",
  levelId: "THCS",
  date: "2026-10-21",
  week: "2026-10-19",
  month: "2026-10",
  semester: "HK1",
  classCode: "6A01",
  grade: 6,
  errorCode: "L01",
  category: "Chuyên cần – vệ sinh",
  issue: "Đi học muộn",
  group: "Nhóm 1",
  penalty: 2,
  unit: "/HS",
  scope: "Tập thể",
  occurrenceCount: 1,
  students: [
    { id: "S1", name: "Học sinh A", classCode: "6A01" },
    { id: "S2", name: "Học sinh B", classCode: "6A01" },
  ],
  unnamedCount: 1,
  relatedStudentCount: 3,
  points: 6,
  reporter: "Cô Lan",
  evidenceUrls: [],
  photoIds: [],
  status: "Mới ghi nhận",
  detail: "Cổng trường 7h05",
  dataCheck: "THIEU_TEN_HS",
  dataIssues: [],
  source: "app",
  createdBy: "editor",
  createdByName: "Cô Lan",
  createdAt: "2026-10-21T01:00:00.000Z",
  rev: 1,
  ...over,
});

const reward = (over: Partial<Reward> = {}): Reward => ({
  id: "THCS_KT-20261021-0001",
  code: "KT-20261021-0001",
  levelId: "THCS",
  date: "2026-10-21",
  week: "2026-10-19",
  month: "2026-10",
  semester: "HK1",
  classCode: "6A01",
  grade: 6,
  points: 2,
  reason: "Lớp tích cực tham gia phong trào",
  reporter: "Cô Lan",
  evidenceUrls: [],
  photoIds: [],
  status: "Mới ghi nhận",
  source: "app",
  createdBy: "editor",
  createdByName: "Cô Lan",
  createdAt: "2026-10-21T01:00:00.000Z",
  rev: 1,
  ...over,
});

describe("snapshots", () => {
  it("incident: catalog snapshot, student names, unnamed count, optional fields omitted when empty", () => {
    expect(incidentSnapshot(incident())).toEqual({
      record: "incident",
      recordId: "THCS_NN-20261021-0001",
      code: "NN-20261021-0001",
      date: "2026-10-21",
      week: "2026-10-19",
      classCode: "6A01",
      grade: 6,
      title: "Đi học muộn",
      errorCode: "L01",
      category: "Chuyên cần – vệ sinh",
      group: "Nhóm 1",
      unit: "/HS",
      scope: "Tập thể",
      occurrenceCount: 1,
      points: 6,
      students: ["Học sinh A", "Học sinh B"],
      unnamedCount: 1,
      detail: "Cổng trường 7h05",
      reporter: "Cô Lan",
      status: "Mới ghi nhận",
    });
    const bare = incidentSnapshot(incident({ group: undefined, detail: undefined, reporter: undefined, unnamedCount: 0, students: [{ id: "S1", name: "", classCode: "6A01" }] }));
    for (const k of ["group", "detail", "reporter", "unnamedCount"]) expect(k in bare).toBe(false);
    expect(bare.students).toEqual([]);
  });

  it("reward: reason as title, note as detail, counted flag from the counted statuses", () => {
    const s = rewardSnapshot(reward({ note: "Có ảnh minh chứng" }), COUNTED);
    expect(s).toMatchObject({ record: "reward", title: "Lớp tích cực tham gia phong trào", points: 2, students: [], detail: "Có ảnh minh chứng", counted: false });
    expect(rewardSnapshot(reward({ status: "Đã xác nhận" }), COUNTED).counted).toBe(true);
  });
});

describe("planRecordNotices – incidents", () => {
  it("created → CREATED; deleted → DELETED; restored → RESTORED (with the actor)", () => {
    const i = incident();
    expect(planRecordNotices("incident", undefined, i, ctx)).toEqual([{ event: "CREATED", snapshot: incidentSnapshot(i), actorName: "Cô Lan" }]);
    const deleted = incident({ deletedAt: "2026-10-22T01:00:00.000Z", rev: 2 });
    expect(planRecordNotices("incident", i, deleted, ctx).map((p) => p.event)).toEqual(["DELETED"]);
    expect(planRecordNotices("incident", deleted, incident({ rev: 3 }), ctx).map((p) => p.event)).toEqual(["RESTORED"]);
    expect(planRecordNotices("incident", deleted, deleted, ctx)).toEqual([]);
    expect(planRecordNotices("incident", undefined, undefined, ctx)).toEqual([]);
  });

  it("an edit notifies only for score-relevant changes, listing their Vietnamese labels", () => {
    const before = incident();
    expect(planRecordNotices("incident", before, incident({ detail: "Sửa mô tả", reporter: "Thầy Nam", status: "Đang xử lý", rev: 2 }), ctx)).toEqual([]);
    expect(planRecordNotices("incident", before, incident({ students: [...before.students].reverse() }), ctx)).toEqual([]);
    const [p] = planRecordNotices("incident", before, incident({ date: "2026-10-20", students: [before.students[0]], points: 4, rev: 2 }), ctx);
    expect(p).toMatchObject({ event: "UPDATED", changes: ["Ngày", "Điểm trừ", "Học sinh"] });
    expect(p.snapshot).toMatchObject({ date: "2026-10-20", points: 4, students: ["Học sinh A"] });
  });

  it("class change → MOVED_OUT for the old class (old snapshot) + CREATED for the new class", () => {
    const before = incident();
    const after = incident({ classCode: "6A02", students: [], unnamedCount: 2, points: 4, rev: 2 });
    const plan = planRecordNotices("incident", before, after, ctx);
    expect(plan.map((p) => [p.event, p.snapshot.classCode, p.movedTo])).toEqual([
      ["MOVED_OUT", "6A01", "6A02"],
      ["CREATED", "6A02", undefined],
    ]);
    expect(plan[0].snapshot).toEqual(incidentSnapshot(before));
    expect(plan[1].snapshot).toEqual(incidentSnapshot(after));
  });
});

describe("planRecordNotices – rewards", () => {
  it("staff reward created → CREATED (counted or not)", () => {
    expect(planRecordNotices("reward", undefined, reward(), ctx)[0]).toMatchObject({ event: "CREATED", snapshot: { counted: false } });
    expect(planRecordNotices("reward", undefined, reward({ status: "Đã xác nhận" }), ctx)[0]).toMatchObject({ event: "CREATED", snapshot: { counted: true } });
  });

  it("status into a counted status → CONFIRMED (other relevant changes listed); out of it → UPDATED; within uncounted → nothing", () => {
    const proposal = reward({ proposed: true });
    expect(planRecordNotices("reward", proposal, reward({ proposed: true, status: "Đang xác minh" }), ctx)).toEqual([]);
    const confirmed = planRecordNotices("reward", proposal, reward({ proposed: true, status: "Đã xác nhận" }), ctx);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ event: "CONFIRMED", snapshot: { counted: true, status: "Đã xác nhận" } });
    expect("changes" in confirmed[0]).toBe(false);
    const confirmedWithPoints = planRecordNotices("reward", proposal, reward({ status: "Đã xác nhận", points: 3 }), ctx);
    expect(confirmedWithPoints[0]).toMatchObject({ event: "CONFIRMED", changes: ["Điểm thưởng"] });
    const unconfirmed = planRecordNotices("reward", reward({ status: "Đã xác nhận" }), reward({ status: "Đang xác minh" }), ctx);
    expect(unconfirmed[0]).toMatchObject({ event: "UPDATED", changes: ["Trạng thái (tính vào thi đua)"], snapshot: { counted: false } });
  });

  it("reason / note edits are not score-relevant; class change → MOVED_OUT + CREATED", () => {
    expect(planRecordNotices("reward", reward(), reward({ reason: "Lý do mới dài hơn", note: "Ghi chú" }), ctx)).toEqual([]);
    expect(planRecordNotices("reward", reward(), reward({ classCode: "6A02" }), ctx).map((p) => `${p.event}:${p.snapshot.classCode}`)).toEqual(["MOVED_OUT:6A01", "CREATED:6A02"]);
  });

  it("without counted statuses every reward is uncounted", () => {
    expect(planRecordNotices("reward", undefined, reward({ status: "Đã xác nhận" }), { actorName: "A" })[0].snapshot.counted).toBe(false);
  });
});

describe("queued jobs, payloads and labels", () => {
  const user: SessionUser = {
    uid: "editor",
    email: "editor@example.edu.vn",
    profile: { uid: "editor", email: "editor@example.edu.vn", displayName: "Cô Lan", role: "EDITOR", levels: [], gvcnClasses: [], active: true, createdAt: "2026-01-01T00:00:00.000Z" },
  };
  const now = Date.parse("2026-10-21T03:00:00.000Z");
  const [created] = planRecordNotices("incident", undefined, incident(), ctx);

  it("noticeJob: PENDING now, no recipients yet, attempts 0, inverted-time id", () => {
    const j = noticeJob("THCS", created, user, now, () => 0);
    expect(j).toEqual({
      id: `${9_999_999_999_999 - now}_00000000`,
      levelId: "THCS",
      kind: "NOTICE",
      status: "PENDING",
      to: [],
      cc: [],
      payload: created,
      attempts: 0,
      nextAttemptAt: "2026-10-21T03:00:00.000Z",
      createdAt: "2026-10-21T03:00:00.000Z",
      createdBy: "editor",
      createdByName: "Cô Lan",
    });
  });

  it("levelOfRecordId reads the level prefix of a record doc id", () => {
    expect(levelOfRecordId("THCS_NN-20261021-0001")).toBe("THCS");
    expect(levelOfRecordId("TH_KT-20261021-0001")).toBe("TH");
    expect(levelOfRecordId("THPT_x")).toBe("THPT");
    expect(levelOfRecordId("XX_NN-1")).toBeUndefined();
    expect(levelOfRecordId("THCS")).toBeUndefined();
  });

  it("payload guards tell the three kinds apart", () => {
    const report = { mode: "week" as const, key: "2026-10-19", to: "khoi-6", detail: false, addressee: "Tổ khối 6", viewerUid: "u", preparedBy: "Cô Lan" };
    expect([isNoticePayload(created), isReportPayload(created), isTestPayload(created)]).toEqual([true, false, false]);
    expect([isNoticePayload(report), isReportPayload(report), isTestPayload(report)]).toEqual([false, true, false]);
    expect([isNoticePayload({ kind: "TEST" }), isReportPayload({ kind: "TEST" }), isTestPayload({ kind: "TEST" })]).toEqual([false, false, true]);
  });

  it("mail log labels and views (payload never exposed)", () => {
    const base = noticeJob("THCS", created, user, now);
    expect(mailJobLabel(base)).toBe("Thông báo GVCN · 6A01 · NN-20261021-0001");
    const [moved] = planRecordNotices("incident", incident(), incident({ classCode: "6A02", students: [], unnamedCount: 1 }), ctx);
    expect(mailJobLabel({ kind: "NOTICE", payload: moved })).toBe("Thông báo GVCN · 6A01 · NN-20261021-0001 · chuyển sang 6A02");
    const [deleted] = planRecordNotices("reward", reward(), reward({ deletedAt: "2026-10-22T00:00:00.000Z" }), ctx);
    expect(mailJobLabel({ kind: "NOTICE", payload: deleted })).toBe("Thông báo GVCN · 6A01 · KT-20261021-0001 · hủy ghi nhận");
    const reportJob: Pick<MailJob, "kind" | "payload"> = {
      kind: "REPORT",
      payload: { mode: "week", key: "2026-10-19", to: "khoi-6", detail: false, addressee: "Tổ khối 6", viewerUid: "u", preparedBy: "Cô Lan" },
    };
    expect(mailJobLabel(reportJob)).toBe("Báo cáo · Tổ khối 6 · Tuần 19/10 – 25/10/2026");
    expect(mailJobLabel({ kind: "REPORT", payload: { ...(reportJob.payload as object), mode: "month", key: "2026-10" } as MailJob["payload"] })).toBe("Báo cáo · Tổ khối 6 · Tháng 10/2026");
    expect(mailJobLabel({ kind: "TEST", payload: { kind: "TEST" } })).toBe("Thư thử");
    const view = toMailJobView(base);
    expect("payload" in view).toBe(false);
    expect(view).toMatchObject({ id: base.id, kind: "NOTICE", status: "PENDING", label: "Thông báo GVCN · 6A01 · NN-20261021-0001" });
  });
});

describe("gvcnEmailsOfClass", () => {
  const account = (over: Partial<UserProfile>): Pick<UserProfile, "email" | "active" | "role" | "gvcnClasses"> => ({
    email: "gv.6a01@example.edu.vn",
    active: true,
    role: "GVCN",
    gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }],
    ...over,
  });

  it("active GVCN accounts of the class ∪ the class list's homeroom email(s), normalised and deduplicated", () => {
    const accounts = [
      account({}),
      account({ email: "GV.6A01@example.edu.vn" }),
      account({ email: "pho.6a01@example.edu.vn", active: false }),
      account({ email: "gv.6a02@example.edu.vn", gvcnClasses: [{ levelId: "THCS", classCode: "6A02" }] }),
      account({ email: "gv.th@example.edu.vn", gvcnClasses: [{ levelId: "TH", classCode: "6A01" }] }),
      account({ email: "editor@example.edu.vn", role: "EDITOR" }),
      account({ email: "khong-hop-le" }),
    ];
    expect(gvcnEmailsOfClass("THCS", "6A01", accounts, { homeroomEmail: "Cô A <co.a@example.edu.vn>; gv.6a01@example.edu.vn, sai@" })).toEqual([
      "gv.6a01@example.edu.vn",
      "co.a@example.edu.vn",
    ]);
    expect(gvcnEmailsOfClass("THCS", "6A03", accounts)).toEqual([]);
  });
});
