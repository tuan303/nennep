/** GVCN notice emails + shared HTML helpers + the test message (pure, no emulators). */
import { describe, expect, it } from "vitest";
import type { NoticePayload, NoticeSnapshot } from "../../types";
import { escapeHtml, formatPointsVN, safeHttpUrl, subjectLine, textHtml, truncateText, buttonHtml, detailsTableHtml } from "../mail/html";
import { buildNoticeMail, noticeLink, noticeSubject, noticeSummary, studentsLine } from "../mail/notice-email";
import { TEST_MAIL_SUBJECT, buildTestMail } from "../mail/test-job";

const BASE = "https://nennep.example.edu.vn";
const CTX = { baseUrl: BASE, levelId: "THCS" as const, levelName: "Trung học cơ sở" };

const incidentSnap = (over: Partial<NoticeSnapshot> = {}): NoticeSnapshot => ({
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
  points: 5,
  students: ["Học sinh A", "Học sinh B"],
  unnamedCount: 2,
  detail: "Cổng trường 7h05",
  reporter: "Cô Lan",
  status: "Mới ghi nhận",
  ...over,
});

const rewardSnap = (over: Partial<NoticeSnapshot> = {}): NoticeSnapshot => ({
  record: "reward",
  recordId: "THCS_KT-20261021-0001",
  code: "KT-20261021-0001",
  date: "2026-10-21",
  week: "2026-10-19",
  classCode: "6A01",
  grade: 6,
  title: "Lớp tích cực tham gia phong trào",
  points: 2,
  students: [],
  reporter: "Cô Lan",
  status: "Đã xác nhận",
  counted: true,
  ...over,
});

const p = (event: NoticePayload["event"], snapshot: NoticeSnapshot, over: Partial<NoticePayload> = {}): NoticePayload => ({ event, snapshot, actorName: "Cô Lan", ...over });

describe("noticeSubject", () => {
  it("follows the agreed formats", () => {
    expect(noticeSubject(p("CREATED", incidentSnap()))).toBe("[Nền nếp] Lớp 6A01: −5 điểm · Đi học muộn (21/10/2026)");
    expect(noticeSubject(p("CREATED", rewardSnap()))).toBe("[Nền nếp] Lớp 6A01: +2 điểm thưởng · Lớp tích cực tham gia phong trào (21/10/2026)");
    expect(noticeSubject(p("CONFIRMED", rewardSnap()))).toBe("[Nền nếp] Lớp 6A01: +2 điểm thưởng · Lớp tích cực tham gia phong trào (21/10/2026)");
    expect(noticeSubject(p("UPDATED", incidentSnap()))).toBe("[Nền nếp] Lớp 6A01: điều chỉnh NN-20261021-0001");
    expect(noticeSubject(p("DELETED", incidentSnap()))).toBe("[Nền nếp] Lớp 6A01: hủy ghi nhận NN-20261021-0001");
    expect(noticeSubject(p("RESTORED", rewardSnap()))).toBe("[Nền nếp] Lớp 6A01: khôi phục KT-20261021-0001");
    expect(noticeSubject(p("MOVED_OUT", incidentSnap(), { movedTo: "6A02" }))).toBe("[Nền nếp] Lớp 6A01: NN-20261021-0001 chuyển sang lớp 6A02");
  });

  it("cuts a long reason to 60 characters, keeps decimals Vietnamese, never contains line breaks", () => {
    const long = "Lớp đạt giải nhất hội thi văn nghệ chào mừng ngày Nhà giáo Việt Nam 20/11 cấp trường năm học";
    const s = noticeSubject(p("CREATED", rewardSnap({ title: `${long}\n` })));
    const reason = s.slice(s.indexOf("· ") + 2, s.lastIndexOf(" ("));
    expect(reason.length).toBeLessThanOrEqual(60);
    expect(reason.length).toBeGreaterThan(55);
    expect(reason.endsWith("…")).toBe(true);
    expect(long.startsWith(reason.slice(0, -1))).toBe(true);
    expect(s).not.toMatch(/[\r\n]/);
    expect(noticeSubject(p("CREATED", incidentSnap({ points: 2.5 })))).toContain("−2,5 điểm");
    expect(noticeSubject(p("CREATED", incidentSnap({ points: 0 })))).toContain(": 0 điểm ·");
  });
});

describe("noticeSummary / studentsLine / link", () => {
  it("says what happened from the class's point of view", () => {
    expect(noticeSummary(p("CREATED", incidentSnap()))).toBe("Lớp 6A01 vừa được ghi nhận một sự việc nền nếp: trừ 5 điểm.");
    expect(noticeSummary(p("CREATED", rewardSnap()))).toBe("Lớp 6A01 vừa được cộng 2 điểm thưởng.");
    expect(noticeSummary(p("CREATED", rewardSnap({ counted: false, status: "Mới ghi nhận" })))).toContain("chưa tính vào thi đua");
    expect(noticeSummary(p("CONFIRMED", rewardSnap()))).toBe("Điểm thưởng KT-20261021-0001 của lớp 6A01 đã được xác nhận: cộng 2 điểm vào thi đua.");
    expect(noticeSummary(p("DELETED", incidentSnap()))).toBe("Sự việc NN-20261021-0001 của lớp 6A01 đã được hủy ghi nhận – 5 điểm trừ không còn được tính.");
    expect(noticeSummary(p("DELETED", rewardSnap({ counted: false })))).toBe("Điểm thưởng KT-20261021-0001 của lớp 6A01 đã được hủy.");
    expect(noticeSummary(p("RESTORED", incidentSnap()))).toContain("được tính lại");
    expect(noticeSummary(p("MOVED_OUT", incidentSnap(), { movedTo: "6A02" }))).toBe("Sự việc NN-20261021-0001 không còn tính cho lớp 6A01: đã được chuyển sang lớp 6A02.");
    expect(noticeSummary(p("UPDATED", rewardSnap()))).toBe("Điểm thưởng KT-20261021-0001 của lớp 6A01 vừa được điều chỉnh.");
  });

  it("names students and counts the unnamed ones", () => {
    expect(studentsLine({ students: ["Học sinh A", "Học sinh B"], unnamedCount: 2 })).toBe("Học sinh A, Học sinh B và 2 HS chưa rõ tên");
    expect(studentsLine({ students: [], unnamedCount: 3 })).toBe("3 HS chưa rõ tên");
    expect(studentsLine({ students: ["Học sinh A"] })).toBe("Học sinh A");
    expect(studentsLine({ students: [] })).toBe("");
  });

  it("links to Khối & lớp of the class for the record's week", () => {
    expect(noticeLink(BASE, { week: "2026-10-19", classCode: "6A01" }, "THCS")).toBe(`${BASE}/lop?level=THCS&mode=week&key=2026-10-19&class=6A01`);
    expect(noticeLink(BASE, { week: "2026-10-19", classCode: "10 A&B" }, "THPT")).toBe(`${BASE}/lop?level=THPT&mode=week&key=2026-10-19&class=10+A%26B`);
  });
});

describe("buildNoticeMail", () => {
  it("HTML: brand bar, greeting, summary, detail rows, link button, footer; text version mirrors it", () => {
    const m = buildNoticeMail(p("UPDATED", incidentSnap(), { changes: ["Ngày", "Học sinh"] }), CTX);
    expect(m.subject).toBe("[Nền nếp] Lớp 6A01: điều chỉnh NN-20261021-0001");
    expect(m.html).toContain("#D21235");
    expect(m.html).toContain("Trường Ngôi Sao Hoàng Mai · Nền nếp");
    expect(m.html).toContain("Kính gửi thầy/cô chủ nhiệm,");
    expect(m.html).toContain("L01 – Đi học muộn (Nhóm 1)");
    expect(m.html).toContain("Học sinh A, Học sinh B và 2 HS chưa rõ tên");
    expect(m.html).toContain("−5");
    expect(m.html).toContain("Ngày, Học sinh");
    expect(m.html).toContain(`href="${BASE}/lop?level=THCS&amp;mode=week&amp;key=2026-10-19&amp;class=6A01"`);
    expect(m.html).toContain("Xem trên phần mềm");
    expect(m.html).toContain("Thư tự động từ phần mềm Nền nếp – vui lòng không trả lời; phản hồi trực tiếp trên phần mềm.");
    expect(m.html).not.toMatch(/<script/i);
    expect(m.text).toContain("Lỗi vi phạm: L01 – Đi học muộn (Nhóm 1)");
    expect(m.text).toContain("Ngày: Thứ Tư, 21/10/2026");
    expect(m.text).toContain("Nội dung thay đổi: Ngày, Học sinh");
    expect(m.text).toContain("Người thực hiện: Cô Lan");
    expect(m.text).toContain(`Xem trên phần mềm: ${BASE}/lop?level=THCS&mode=week&key=2026-10-19&class=6A01`);
    expect(m.text).not.toContain("Số lần vi phạm"); // "/HS": no occurrence row
  });

  it("escapes every user text (reason, detail, names, actor)", () => {
    const evil = "<img src=x onerror=alert(1)> & \"quote\"";
    const m = buildNoticeMail(p("CREATED", rewardSnap({ title: evil, detail: evil, reporter: evil }), { actorName: evil }), CTX);
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quote&quot;");
    expect(m.text).toContain(evil); // plain text is not HTML
  });

  it("reward rows show the counted state; MOVED_OUT shows the new class; /lần shows the occurrences", () => {
    const r = buildNoticeMail(p("CREATED", rewardSnap({ counted: false, status: "Mới ghi nhận" })), CTX);
    expect(r.text).toContain("Trạng thái: Mới ghi nhận (chưa tính vào thi đua)");
    expect(r.text).toContain("Điểm thưởng: +2");
    const moved = buildNoticeMail(p("MOVED_OUT", incidentSnap(), { movedTo: "6A02" }), CTX);
    expect(moved.text).toContain("Chuyển sang lớp: 6A02");
    const perTime = buildNoticeMail(p("CREATED", incidentSnap({ unit: "/lần", occurrenceCount: 3, students: [], unnamedCount: undefined })), CTX);
    expect(perTime.text).toContain("Số lần vi phạm: 3");
    expect(perTime.text).not.toContain("Học sinh:");
  });
});

describe("html helpers", () => {
  it("escape, line breaks, safe links, truncation, subjects, points", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(textHtml("a\r\nb\n<c>")).toBe("a<br>b<br>&lt;c&gt;");
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,x")).toBeUndefined();
    expect(safeHttpUrl("not a url")).toBeUndefined();
    expect(safeHttpUrl("https://example.edu.vn/a?b=1")).toBe("https://example.edu.vn/a?b=1");
    expect(buttonHtml("javascript:alert(1)", "Bấm")).toBe("");
    expect(detailsTableHtml([{ label: "Trống", value: "  " }])).toBe("");
    expect(truncateText("  một   hai  ", 60)).toBe("một hai");
    expect(truncateText("abcdef", 4)).toBe("abc…");
    expect(subjectLine(" a \n b ")).toBe("a b");
    expect(formatPointsVN(-2.5)).toBe("2,5");
    expect(formatPointsVN(1234)).toBe("1.234");
  });
});

describe("buildTestMail", () => {
  it("names the sender, level, requester and time (Vietnam time)", () => {
    const m = buildTestMail({ baseUrl: BASE, levelId: "THCS", sender: "nennep@example.edu.vn", requestedBy: "Quản trị", at: "2026-10-21T03:00:00.000Z" });
    expect(m.subject).toBe(TEST_MAIL_SUBJECT);
    expect(m.text).toContain("Hộp thư gửi: nennep@example.edu.vn");
    expect(m.text).toContain("Cấp học: Trung học cơ sở");
    expect(m.text).toContain("Người yêu cầu: Quản trị");
    expect(m.text).toMatch(/10:00:00/);
    expect(m.html).toContain(`${BASE}/cai-dat`);
  });
});
