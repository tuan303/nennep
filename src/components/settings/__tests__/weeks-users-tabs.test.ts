import { describe, expect, it } from "vitest";
import { WeeksPutSchema, type BulkGvcnResult } from "@/lib/contract";
import { makeFixtureDataset, FIXTURE_TODAY, FIXTURE_HOLIDAY_WEEK } from "@/lib/engine/__fixtures__/dataset";
import type { UserProfile } from "@/lib/types";
import { evidenceSummaryText, normalizeBatchId, rebuildCountsOf, rebuildSummaryText, resetConfirmText, storageText } from "../lib/maintenance";
import { resolveTab, SETTINGS_TABS, settingsTabHref, visibleTabs } from "../lib/tabs";
import {
  adminGuard,
  bulkCreatedText,
  createInputFromDraft,
  draftFromProfile,
  emptyUserDraft,
  filterUsers,
  gvcnClassesText,
  isProtectedAdmin,
  LAST_ADMIN_MESSAGE,
  SELF_SCOPE_MESSAGE,
  SELF_GUARD_MESSAGE,
  updatePatchFromDraft,
  userStats,
  validateUserDraft,
} from "../lib/users";
import {
  calendarDrift,
  isCurrentWeek,
  monthOptionsOf,
  rowsFromWeeks,
  semesterOptionsOf,
  validateWeekRows,
  weekChangesCount,
  weekRowLabel,
  weeksPayload,
  weeksSummary,
} from "../lib/weeks-edit";

describe("weeks editor", () => {
  const ds = makeFixtureDataset();
  const rows = rowsFromWeeks(ds.weeks);

  it("summarises the fixture calendar", () => {
    const s = weeksSummary(rows, FIXTURE_TODAY);
    expect(s.total).toBe(ds.weeks.length);
    expect(s.notCounted).toBe(1);
    expect(rows[s.currentIndex].weekStart).toBe("2026-10-19");
    expect(isCurrentWeek("2026-10-19", FIXTURE_TODAY)).toBe(true);
    expect(rows.find((r) => r.weekStart === FIXTURE_HOLIDAY_WEEK)?.counted).toBe(false);
  });

  it("labels weeks and offers month / semester choices", () => {
    expect(weekRowLabel("2026-08-31")).toBe("Tuần 31/08 – 06/09/2026");
    expect(monthOptionsOf({ weekStart: "2026-08-31", month: "2026-08" }).map((o) => o.label)).toEqual(["Tháng 8/2026", "Tháng 9/2026"]);
    expect(semesterOptionsOf(ds.config.semesters).map((o) => o.label)).toEqual(["Ngoài học kỳ", "Học kỳ I", "Học kỳ II"]);
    expect(semesterOptionsOf(ds.config.semesters, "HK3").at(-1)?.label).toMatch(/không còn/);
  });

  it("validates and builds a schema-valid payload", () => {
    expect(validateWeekRows(rows, ds.config.semesters)).toEqual({});
    const edited = rows.map((r, i) => (i === 0 ? { ...r, semester: "HK9", note: "x".repeat(201) } : r));
    expect(validateWeekRows(edited, ds.config.semesters)[rows[0].weekStart]).toEqual({
      semester: "Học kỳ không có trong cấu hình.",
      note: "Ghi chú tối đa 200 ký tự.",
    });
    const payload = weeksPayload(rows);
    expect(WeeksPutSchema.safeParse(payload).success).toBe(true);
    expect(weekChangesCount(edited, rows)).toBe(1);
  });

  it("detects drift from the config calendar", () => {
    expect(calendarDrift(ds.weeks, ds.config).matches).toBe(true);
    const drift = calendarDrift(ds.weeks, { ...ds.config, semesters: [{ ...ds.config.semesters[0] }, { ...ds.config.semesters[1], end: "2027-06-14" }] });
    expect(drift.added).toEqual(["2027-06-07", "2027-06-14"]);
    expect(drift.matches).toBe(false);
  });
});

const profile = (p: Partial<UserProfile> & Pick<UserProfile, "uid" | "role">): UserProfile => ({
  email: `${p.uid}@nshm.edu.vn`,
  displayName: p.uid,
  levels: [],
  gvcnClasses: [],
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  ...p,
});

describe("users view-model", () => {
  const users = [
    profile({ uid: "admin", role: "ADMIN", displayName: "Nguyễn Quản Trị" }),
    profile({ uid: "gv1", role: "GVCN", displayName: "Lê Văn Hùng", levels: ["THCS"], gvcnClasses: [{ levelId: "THCS", classCode: "6A03" }] }),
    profile({ uid: "bgh", role: "VIEWER", displayName: "Trần Hiệu Trưởng", active: false, levels: ["TH", "THPT"] }),
  ];

  it("filters by text, role and status; counts stats", () => {
    expect(filterUsers(users, { query: "hung" }).map((u) => u.uid)).toEqual(["gv1"]);
    expect(filterUsers(users, { query: "6a03" }).map((u) => u.uid)).toEqual(["gv1"]);
    expect(filterUsers(users, { status: "locked" }).map((u) => u.uid)).toEqual(["bgh"]);
    expect(filterUsers(users, { role: "ADMIN" })).toHaveLength(1);
    expect(userStats(users)).toMatchObject({ total: 3, active: 2, locked: 1 });
  });

  it("describes homeroom classes", () => {
    expect(gvcnClassesText(users[1])).toBe("6A03");
    expect(
      gvcnClassesText({
        gvcnClasses: [
          { levelId: "THPT", classCode: "10A1" },
          { levelId: "THCS", classCode: "6A01" },
        ],
      }),
    ).toBe("6A01 (THCS), 10A1 (THPT)");
  });

  it("validates drafts and builds API inputs", () => {
    const d = { ...emptyUserDraft("GVCN"), email: " GV@NSHM.edu.vn ", displayName: "Cô Hà", password: "123" };
    expect(validateUserDraft(d, "create")).toEqual({
      password: "Mật khẩu tối thiểu 8 ký tự.",
      gvcnClasses: "GVCN cần được gán ít nhất một lớp chủ nhiệm.",
    });
    const ok = { ...d, password: "", levels: ["TH" as const], gvcnClasses: [{ levelId: "THCS" as const, classCode: "6A01" }] };
    expect(validateUserDraft(ok, "create")).toEqual({});
    expect(createInputFromDraft(ok)).toEqual({
      email: "gv@nshm.edu.vn",
      displayName: "Cô Hà",
      role: "GVCN",
      levels: ["THCS"],
      gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }],
    });
    expect(createInputFromDraft({ ...ok, role: "EDITOR" }).gvcnClasses).toEqual([]);
  });

  it("patches only changed fields", () => {
    const p = users[1];
    expect(updatePatchFromDraft(draftFromProfile(p), p)).toEqual({});
    const d = { ...draftFromProfile(p), role: "EDITOR" as const, levels: ["THCS" as const], active: false };
    expect(updatePatchFromDraft(d, p)).toEqual({ role: "EDITOR", gvcnClasses: [], active: false });
  });

  it("guards self-demotion and the last active admin", () => {
    const admin = users[0];
    expect(adminGuard({ role: "VIEWER", active: true }, admin, { currentUid: "admin", users })).toBe(SELF_GUARD_MESSAGE);
    expect(adminGuard({ role: "ADMIN", active: false }, admin, { currentUid: "other", users })).toBe(LAST_ADMIN_MESSAGE);
    const two = [...users, profile({ uid: "admin2", role: "ADMIN" })];
    expect(adminGuard({ role: "VIEWER", active: true }, admin, { currentUid: "admin2", users: two })).toBeUndefined();
    expect(isProtectedAdmin(admin, { currentUid: "admin2", users: two })).toBe(false);
    expect(isProtectedAdmin(admin, { currentUid: "admin", users: two })).toBe(true);
  });

  it("SECURITY-4: no self level change; the last school-wide admin cannot be limited to some levels", () => {
    const admin = users[0];
    expect(adminGuard({ role: "ADMIN", active: true, levels: ["TH"] }, admin, { currentUid: "admin", users })).toBe(SELF_SCOPE_MESSAGE);
    expect(adminGuard({ role: "ADMIN", active: true, levels: ["TH"] }, admin, { currentUid: "other", users })).toBe(LAST_ADMIN_MESSAGE);
    // A level-limited admin does not count as the school-wide admin that must remain.
    const limited = [...users, profile({ uid: "admin2", role: "ADMIN", levels: ["THCS"] })];
    expect(adminGuard({ role: "VIEWER", active: true }, admin, { currentUid: "admin2", users: limited })).toBe(LAST_ADMIN_MESSAGE);
    const two = [...users, profile({ uid: "admin3", role: "ADMIN" })];
    expect(adminGuard({ role: "ADMIN", active: true, levels: ["TH"] }, admin, { currentUid: "admin3", users: two })).toBeUndefined();
  });

  it("formats bulk GVCN results for copying", () => {
    const r: BulkGvcnResult = {
      created: [{ email: "a@x.vn", displayName: "Cô A", classCode: "6A01, 6A02", tempPassword: "Nshm-AAAA-1111" }],
      linkedExisting: [],
      skipped: [{ classCode: "6A03", reason: "Chưa có email GVCN." }],
    };
    expect(bulkCreatedText(r, "THCS").split("\n")).toEqual([
      "Tài khoản GVCN mới – THCS",
      "Lớp\tHọ tên\tEmail\tMật khẩu tạm",
      "6A01, 6A02\tCô A\ta@x.vn\tNshm-AAAA-1111",
    ]);
  });
});

describe("tabs & maintenance", () => {
  it("resolves deep links and aliases within visible tabs", () => {
    const all = visibleTabs(() => true);
    expect(all).toHaveLength(SETTINGS_TABS.length);
    expect(resolveTab("lich-tuan", all)).toBe("lich-tuan");
    expect(resolveTab("USERS", all)).toBe("nguoi-dung");
    expect(resolveTab("khong-co", all)).toBe("cau-hinh");
    const noUsers = visibleTabs((p) => p !== "users.manage");
    expect(resolveTab("nguoi-dung", noUsers)).toBe("cau-hinh");
    expect(
      resolveTab(
        null,
        visibleTabs((p) => p === "users.manage"),
      ),
    ).toBe("nguoi-dung");
    expect(SETTINGS_TABS.filter((t) => !t.perLevel).map((t) => t.id)).toEqual(["nguoi-dung"]);
    expect(settingsTabHref("lich-tuan")).toBe("/cai-dat?tab=lich-tuan");
  });

  it("builds the reset confirmation and reads rebuild results", () => {
    expect(resetConfirmText("THCS")).toBe("XOA THCS");
    const res = { ok: true, results: { THCS: { weeks: 42, incidents: 1204, rewards: 7, students: 1500 } } };
    const counts = rebuildCountsOf(res, "THCS");
    expect(counts && rebuildSummaryText(counts)).toBe("42 tuần · 1.204 sự việc · 7 điểm thưởng · 1.500 học sinh");
    expect(rebuildCountsOf({ ok: true }, "THCS")).toBeUndefined();
    expect(normalizeBatchId("  RESET:abc123 ")).toBe("abc123");
  });

  it("INTEGRITY-12: describes the evidence photo statistics", () => {
    expect(storageText(512)).toBe("512 B");
    expect(storageText(204_800)).toBe("200 KB");
    expect(storageText(5_400_000)).toBe("5,1 MB");
    const base = { levelId: "THCS" as const, dryRun: true, total: 120, totalBytes: 25_690_112, attached: 112, deleted: 0 };
    expect(evidenceSummaryText({ ...base, orphaned: 8, orphanedBytes: 1_677_722 })).toBe(
      "120 ảnh (24,5 MB) · 112 đang gắn với bản ghi · 8 ảnh không dùng (1,6 MB)",
    );
    expect(evidenceSummaryText({ ...base, orphaned: 0, orphanedBytes: 0 })).toContain("không có ảnh thừa");
  });
});
