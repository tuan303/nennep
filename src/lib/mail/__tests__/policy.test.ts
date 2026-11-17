/** Mail policies: outbox backoff and the score-relevant changes that trigger a GVCN notice. */
import { describe, expect, it } from "vitest";
import type { RewardStatus } from "../../types";
import {
  MAIL_RETRY_DELAYS_MS,
  NOTICE_FIELDS,
  NOTICE_FIELD_LABELS,
  incidentNoticeFields,
  isNoticeRelevantChange,
  isRewardCounted,
  nextAttemptDelayMs,
  noticeChangeLabels,
  noticeRelevantFields,
  rewardNoticeFields,
  type IncidentNoticeView,
  type RewardNoticeView,
} from "../policy";

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("nextAttemptDelayMs", () => {
  it("backs off 1 min, 5 min, 30 min, 2 h, 12 h", () => {
    expect([1, 2, 3, 4, 5].map(nextAttemptDelayMs)).toEqual([1 * MIN, 5 * MIN, 30 * MIN, 2 * HOUR, 12 * HOUR]);
    expect(MAIL_RETRY_DELAYS_MS).toHaveLength(5);
  });

  it("clamps out-of-range attempt counts", () => {
    expect(nextAttemptDelayMs(0)).toBe(1 * MIN);
    expect(nextAttemptDelayMs(-3)).toBe(1 * MIN);
    expect(nextAttemptDelayMs(9)).toBe(12 * HOUR);
    expect(nextAttemptDelayMs(2.7)).toBe(5 * MIN);
  });
});

describe("score-relevant fields", () => {
  it("lists the incident and reward fields of the spec", () => {
    expect(NOTICE_FIELDS.incident).toEqual(["date", "classCode", "errorCode", "points", "students", "unnamedCount", "occurrenceCount", "scope"]);
    expect(NOTICE_FIELDS.reward).toEqual(["date", "classCode", "points", "status"]);
  });

  it("isNoticeRelevantChange ignores non-scoring fields", () => {
    expect(isNoticeRelevantChange("incident", ["detail", "reporter", "status", "evidenceUrls", "photoIds"])).toBe(false);
    expect(isNoticeRelevantChange("incident", ["detail", "students"])).toBe(true);
    expect(isNoticeRelevantChange("incident", [])).toBe(false);
    expect(isNoticeRelevantChange("reward", ["reason", "note", "reporter"])).toBe(false);
    expect(isNoticeRelevantChange("reward", ["points"])).toBe(true);
    expect(isNoticeRelevantChange("reward", ["errorCode"])).toBe(false);
  });

  it("orders the relevant fields and labels them in Vietnamese", () => {
    expect(noticeRelevantFields("incident", ["scope", "detail", "date", "points"])).toEqual(["date", "points", "scope"]);
    expect(noticeChangeLabels("incident", ["students", "date", "detail"])).toEqual(["Ngày", "Học sinh"]);
    expect(noticeChangeLabels("reward", ["points", "status", "reason"])).toEqual(["Điểm thưởng", "Trạng thái (tính vào thi đua)"]);
    expect(noticeChangeLabels("incident", ["points"])).toEqual(["Điểm trừ"]);
  });

  it("has a label for every field", () => {
    for (const f of NOTICE_FIELDS.incident) expect(NOTICE_FIELD_LABELS.incident[f]).toMatch(/\S/);
    for (const f of NOTICE_FIELDS.reward) expect(NOTICE_FIELD_LABELS.reward[f]).toMatch(/\S/);
  });
});

describe("record diffs", () => {
  const incident: IncidentNoticeView = {
    date: "2026-10-21",
    classCode: "6A01",
    errorCode: "L01",
    points: 4,
    students: [
      { id: "S1", name: "Học sinh 1", classCode: "6A01" },
      { id: "S2", name: "Học sinh 2", classCode: "6A01" },
    ],
    unnamedCount: 0,
    occurrenceCount: 1,
    scope: "Tập thể",
  };

  it("incidentNoticeFields: nothing changed / student order ignored", () => {
    expect(incidentNoticeFields(incident, { ...incident })).toEqual([]);
    expect(incidentNoticeFields(incident, { ...incident, students: [...incident.students].reverse() })).toEqual([]);
  });

  it("incidentNoticeFields: lists every changed scoring field", () => {
    const after: IncidentNoticeView = {
      ...incident,
      date: "2026-10-22",
      students: [incident.students[0]],
      points: 2,
      unnamedCount: 1,
    };
    expect(incidentNoticeFields(incident, after)).toEqual(["date", "points", "students", "unnamedCount"]);
    expect(incidentNoticeFields(incident, { ...incident, classCode: "6A02", errorCode: "L02", occurrenceCount: 2, scope: "Cá nhân" })).toEqual([
      "classCode",
      "errorCode",
      "occurrenceCount",
      "scope",
    ]);
  });

  const counted: RewardStatus[] = ["Đã xác nhận"];
  const reward: RewardNoticeView = { date: "2026-10-21", classCode: "6A01", points: 2, status: "Mới ghi nhận" };

  it("isRewardCounted follows config.rewardCountedStatuses", () => {
    expect(isRewardCounted("Đã xác nhận", counted)).toBe(true);
    expect(isRewardCounted("Đang xác minh", counted)).toBe(false);
    expect(isRewardCounted("Đang xác minh", ["Đang xác minh", "Đã xác nhận"])).toBe(true);
  });

  it("rewardNoticeFields: a status change counts only when it crosses the counted boundary", () => {
    expect(rewardNoticeFields(reward, { ...reward, status: "Đang xác minh" }, counted)).toEqual([]);
    expect(rewardNoticeFields(reward, { ...reward, status: "Đã xác nhận" }, counted)).toEqual(["status"]);
    expect(rewardNoticeFields({ ...reward, status: "Đã xác nhận" }, { ...reward, status: "Mới ghi nhận" }, counted)).toEqual(["status"]);
    expect(rewardNoticeFields(reward, { ...reward, status: "Đang xác minh" }, ["Đang xác minh"])).toEqual(["status"]);
  });

  it("rewardNoticeFields: date, class and points", () => {
    expect(rewardNoticeFields(reward, { ...reward }, counted)).toEqual([]);
    expect(rewardNoticeFields(reward, { ...reward, date: "2026-10-23", classCode: "6A02", points: 3 }, counted)).toEqual(["date", "classCode", "points"]);
  });
});
