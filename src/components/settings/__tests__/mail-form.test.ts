import { describe, expect, it } from "vitest";
import { MailSettingsSchema, type ReportMailClassRecipients } from "@/lib/contract";
import { MAIL_MAX_RECIPIENTS } from "@/lib/constants";
import { planReportTargets } from "@/lib/server/mail/report-send";
import type { MailSettings } from "@/lib/types";
import {
  addEmailEntries,
  blockedEmailEntries,
  ccOverflowWarning,
  changedMailParts,
  domainListText,
  draftAllowedDomains,
  invalidDomainEntries,
  invalidEmailEntries,
  isValidEmailEntry,
  mailDraft,
  mailFieldOfPath,
  mailList,
  mailListIds,
  mailListLabel,
  mailPayload,
  mailServerErrors,
  noticeCoverage,
  noticesWarning,
  overflowWarning,
  parseDomainList,
  recipientCapacity,
  removeEntry,
  senderDomain,
  validateMailDraft,
  withMailList,
} from "../mail/lib/mail-form";

// Fictional addresses only (public repo).
const settings = (over: Partial<MailSettings> = {}): MailSettings => ({
  levelId: "THCS",
  notices: { enabled: false, incidents: true, rewards: true },
  report: { bgh: ["bgh@example.edu.vn"], grades: { "6": ["tk6@example.edu.vn"], "10": ["thpt@example.edu.vn"] }, cc: [] },
  allowedDomains: [],
  rev: 3,
  ...over,
});

describe("mail settings draft", () => {
  it("lists every grade of the level, drops other grades and copies the lists", () => {
    const s = settings();
    const d = mailDraft(s, "THCS");
    expect(d.rev).toBe(3);
    expect(Object.keys(d.grades)).toEqual(["6", "7", "8", "9"]);
    expect(d.grades["6"]).toEqual(["tk6@example.edu.vn"]);
    expect(d.grades["7"]).toEqual([]);
    expect(d.bgh).not.toBe(s.report.bgh);
    expect(d.notices).not.toBe(s.notices);
  });

  it("names the lists in display order", () => {
    expect(mailListIds("THCS")).toEqual(["bgh", "grade-6", "grade-7", "grade-8", "grade-9", "cc"]);
    expect(mailListIds("THPT")).toEqual(["bgh", "grade-10", "grade-11", "grade-12", "cc"]);
    expect(mailListIds("THCS").map(mailListLabel)).toEqual(["Ban Giám hiệu", "Tổ khối 6", "Tổ khối 7", "Tổ khối 8", "Tổ khối 9", "Luôn gửi kèm (CC)"]);
  });

  it("reads and replaces one list without touching the others", () => {
    const d = mailDraft(settings(), "THCS");
    const next = withMailList(d, "grade-7", ["tk7@example.edu.vn"]);
    expect(mailList(next, "grade-7")).toEqual(["tk7@example.edu.vn"]);
    expect(mailList(next, "grade-6")).toEqual(["tk6@example.edu.vn"]);
    expect(mailList(d, "grade-7")).toEqual([]);
    expect(mailList(withMailList(d, "cc", ["vp@example.edu.vn"]), "cc")).toEqual(["vp@example.edu.vn"]);
    expect(withMailList(d, "bgh", []).bgh).toEqual([]);
  });
});

describe("address chips", () => {
  it("adds pasted lists: normalised valid addresses, invalid ones as typed, duplicates skipped", () => {
    const res = addEmailEntries(["gv.6a01@example.edu.vn"], "GV.6A01@Example.edu.vn; Tổ trưởng <TT@example.edu.vn>\nsai-dia-chi@, gv.6a02@example.edu.vn");
    expect(res.list).toEqual(["gv.6a01@example.edu.vn", "tt@example.edu.vn", "gv.6a02@example.edu.vn", "sai-dia-chi@"]);
    expect(res.added).toBe(3);
    expect(res.duplicates).toBe(1);
    expect(addEmailEntries(res.list, "  ").added).toBe(0);
    expect(addEmailEntries(res.list, "SAI-DIA-CHI@").duplicates).toBe(1);
  });

  it("flags invalid entries and addresses outside the allowed domains", () => {
    const list = ["a@example.edu.vn", "b@other.vn", "khong hop le"];
    expect(isValidEmailEntry("A@Example.edu.vn ")).toBe(true);
    expect(invalidEmailEntries(list)).toEqual(["khong hop le"]);
    expect(blockedEmailEntries(list, ["example.edu.vn"])).toEqual(["b@other.vn"]);
    // Domains unknown (mail not configured, no list): nothing is flagged.
    expect(blockedEmailEntries(list, [])).toEqual([]);
    expect(removeEntry(list, "b@other.vn")).toEqual(["a@example.edu.vn", "khong hop le"]);
  });
});

describe("allowed domains", () => {
  it("parses a typed comma list (normalised, deduplicated, invalid kept)", () => {
    expect(parseDomainList("@Example.edu.vn., b.vn; B.vn  sai")).toEqual(["example.edu.vn", "b.vn", "sai"]);
    expect(parseDomainList(" , ")).toEqual([]);
    expect(domainListText(["a.vn", "b.vn"])).toBe("a.vn, b.vn");
    expect(invalidDomainEntries(["a.vn", "sai"])).toEqual(["sai"]);
  });

  it("falls back to the sender's domain when the list has no valid domain", () => {
    const status = { sender: "nennep@example.edu.vn" };
    expect(draftAllowedDomains({ allowedDomains: [] }, status)).toEqual(["example.edu.vn"]);
    expect(draftAllowedDomains({ allowedDomains: ["sai"] }, status)).toEqual(["example.edu.vn"]);
    expect(draftAllowedDomains({ allowedDomains: ["school.example.vn"] }, status)).toEqual(["school.example.vn"]);
    expect(draftAllowedDomains({ allowedDomains: [] }, {})).toEqual([]);
    expect(senderDomain(status)).toBe("example.edu.vn");
    expect(senderDomain({})).toBe("");
  });
});

describe("validation and payload", () => {
  it("accepts the stored settings", () => {
    expect(validateMailDraft(mailDraft(settings(), "THCS"), "THCS")).toEqual({});
  });

  it("reports invalid addresses, too many addresses and invalid domains per field", () => {
    const d = mailDraft(settings(), "THCS");
    const many = Array.from({ length: MAIL_MAX_RECIPIENTS + 1 }, (_, i) => `gv${i}@example.edu.vn`);
    const bad = { ...withMailList(withMailList(d, "bgh", ["bgh@example.edu.vn", "sai@"]), "grade-8", many), allowedDomains: ["example.edu.vn", "khong_hop_le"] };
    const e = validateMailDraft(bad, "THCS");
    expect(e.bgh).toBe("Địa chỉ email không hợp lệ: sai@.");
    expect(e["grade-8"]).toBe(`Tối đa ${MAIL_MAX_RECIPIENTS} địa chỉ (đang có ${MAIL_MAX_RECIPIENTS + 1}).`);
    expect(e.allowedDomains).toContain("Tên miền không hợp lệ: khong_hop_le");
    expect(e.cc).toBeUndefined();
    const tooManyDomains = { ...d, allowedDomains: Array.from({ length: 21 }, (_, i) => `d${i}.example.vn`) };
    expect(validateMailDraft(tooManyDomains, "THCS").allowedDomains).toBe("Tối đa 20 tên miền.");
  });

  it("lists at most three offending entries", () => {
    const d = withMailList(mailDraft(settings(), "THCS"), "cc", ["a@", "b@", "c@", "d@", "e@"]);
    expect(validateMailDraft(d, "THCS").cc).toBe("Địa chỉ email không hợp lệ: a@, b@, c@ và 2 mục khác.");
  });

  it("builds a PUT body the contract accepts (empty grades left out, baseRev = rev)", () => {
    const d = { ...withMailList(mailDraft(settings(), "THCS"), "cc", ["VP@Example.edu.vn"]), allowedDomains: ["Example.edu.vn"] };
    const body = mailPayload(d);
    expect(body).toEqual({
      notices: { enabled: false, incidents: true, rewards: true },
      report: { bgh: ["bgh@example.edu.vn"], grades: { "6": ["tk6@example.edu.vn"] }, cc: ["vp@example.edu.vn"] },
      allowedDomains: ["example.edu.vn"],
      baseRev: 3,
    });
    expect(MailSettingsSchema.safeParse(body).success).toBe(true);
  });

  it("summarises what changed", () => {
    const base = mailDraft(settings(), "THCS");
    expect(changedMailParts(base, base, "THCS")).toEqual([]);
    const draft = {
      ...withMailList(withMailList(base, "grade-9", ["tk9@example.edu.vn"]), "cc", ["vp@example.edu.vn"]),
      notices: { ...base.notices, enabled: true },
      allowedDomains: ["example.edu.vn"],
    };
    expect(changedMailParts(draft, base, "THCS")).toEqual(["Thông báo GVCN", "Tổ khối 9", "Luôn gửi kèm (CC)", "Tên miền được phép"]);
  });

  it("maps server / schema paths to fields", () => {
    expect(mailFieldOfPath("report.bgh.1")).toBe("bgh");
    expect(mailFieldOfPath("report.cc")).toBe("cc");
    expect(mailFieldOfPath("report.grades.06.2")).toBe("grade-6");
    expect(mailFieldOfPath("allowedDomains.0")).toBe("allowedDomains");
    expect(mailFieldOfPath("notices.enabled")).toBeUndefined();
    expect(mailFieldOfPath("")).toBeUndefined();
    const res = mailServerErrors([
      { path: "report.grades.7.0", message: "Địa chỉ email không hợp lệ: x" },
      { path: "report.grades.7.1", message: "Lỗi thứ hai" },
      { path: "", message: "Khối không thuộc cấp học" },
      { path: "baseRev", message: "Khối không thuộc cấp học" },
    ]);
    expect(res.fields).toEqual({ "grade-7": "Địa chỉ email không hợp lệ: x" });
    expect(res.general).toEqual(["Khối không thuộc cấp học"]);
  });
});

describe("per-email recipient limit (non-blocking warning)", () => {
  const D = "example.edu.vn";
  const addrs = (prefix: string, n: number, domain = D) => Array.from({ length: n }, (_, i) => `${prefix}${i}@${domain}`);
  const draftWith = (lists: Partial<Record<"bgh" | "cc" | "grade-6" | "grade-9", string[]>>) =>
    Object.entries(lists).reduce((d, [id, list]) => withMailList(d, id as "bgh", list), mailDraft(settings({ report: { bgh: [], grades: {}, cc: [] } }), "THCS"));
  /** Would the send (report-send.ts) refuse the default email of `to` with this CC? */
  const refused = (to: string[], cc: string[]) => {
    try {
      planReportTargets([{ to: "bgh", addressee: "Ban Giám hiệu", recipients: to }], { domains: [D], settingsCc: cc });
      return false;
    } catch {
      return true;
    }
  };

  it("warns when a list plus CC exceeds the limit after dedupe – like the send", () => {
    // 30 BGH + 25 CC of which 5 are also BGH = 50 distinct: accepted.
    const bgh = addrs("bgh", 30);
    const cc = [...bgh.slice(0, 5).map((e) => e.toUpperCase()), ...addrs("vp", 20)];
    const fits = draftWith({ bgh, cc });
    expect(recipientCapacity(fits, "THCS", [D])).toEqual({ over: [], ccFull: false });
    expect(refused(bgh, cc)).toBe(false);
    expect(ccOverflowWarning(recipientCapacity(fits, "THCS", [D]))).toBeUndefined();
    // One more CC address: 51 – the send of the BGH email would be refused.
    const cc51 = [...cc, `vp99@${D}`];
    const over = recipientCapacity(draftWith({ bgh, cc: cc51 }), "THCS", [D]);
    expect(over).toEqual({ over: [{ id: "bgh", total: 51 }], ccFull: false });
    expect(refused(bgh, cc51)).toBe(true);
    // The save stays possible: no field error.
    expect(validateMailDraft(draftWith({ bgh, cc: cc51 }), "THCS")).toEqual({});
    expect(overflowWarning(over.over[0])).toBe(
      `Thư báo cáo Ban Giám hiệu sẽ có 51 người nhận (kể cả CC), quá giới hạn ${MAIL_MAX_RECIPIENTS} người nhận mỗi thư nên sẽ không gửi được. Bớt địa chỉ ở danh sách này hoặc ở “Luôn gửi kèm (CC)”.`,
    );
    expect(ccOverflowWarning(over)).toBe(`Cộng với danh sách này, thư báo cáo Ban Giám hiệu vượt giới hạn ${MAIL_MAX_RECIPIENTS} người nhận mỗi thư nên sẽ không gửi được.`);
  });

  it("checks every Tổ khối, in display order; empty lists are not checked", () => {
    const cc = addrs("vp", 45);
    const d = draftWith({ bgh: addrs("bgh", 5), "grade-6": addrs("tk6-", 6), "grade-9": addrs("tk9-", 10), cc });
    const c = recipientCapacity(d, "THCS", [D]);
    expect(c.over).toEqual([
      { id: "grade-6", total: 51 },
      { id: "grade-9", total: 55 },
    ]);
    expect(ccOverflowWarning(c)).toContain("thư báo cáo Tổ khối 6, Tổ khối 9 vượt giới hạn");
    expect(overflowWarning(c.over[1])).toContain("Thư báo cáo Tổ khối 9 sẽ có 55 người nhận");
  });

  it("counts only what would be sent: valid, normalised, inside the allowed domains", () => {
    const bgh = [...addrs("bgh", 40), "sai@", ` BGH0@Example.edu.vn `];
    const cc = [...addrs("vp", 10), ...addrs("ngoai", 5, "other.example.com")];
    // 40 + 10 allowed = 50: the 5 CC addresses outside the domains are dropped by the send.
    expect(recipientCapacity(draftWith({ bgh, cc }), "THCS", [D]).over).toEqual([]);
    expect(refused(addrs("bgh", 40), cc)).toBe(false);
    // Domains unknown ([]): every valid address counts.
    expect(recipientCapacity(draftWith({ bgh, cc }), "THCS", []).over).toEqual([{ id: "bgh", total: 55 }]);
  });

  it("a full CC list: every email would exceed it (GVCN too); lists / CC over the limit alone are field errors instead", () => {
    const full = recipientCapacity(draftWith({ cc: addrs("vp", MAIL_MAX_RECIPIENTS) }), "THCS", [D]);
    expect(full).toEqual({ over: [], ccFull: true });
    expect(ccOverflowWarning(full)).toBe(
      `Danh sách đã đủ ${MAIL_MAX_RECIPIENTS} địa chỉ: mọi thư báo cáo (kể cả thư cho GVCN) đều có thêm người nhận nên sẽ vượt giới hạn ${MAIL_MAX_RECIPIENTS} người nhận mỗi thư và không gửi được.`,
    );
    expect(refused([`gv.6a01@${D}`], addrs("vp", MAIL_MAX_RECIPIENTS))).toBe(true);
    const ccOver = draftWith({ bgh: addrs("bgh", 3), cc: addrs("vp", MAIL_MAX_RECIPIENTS + 1) });
    expect(recipientCapacity(ccOver, "THCS", [D])).toEqual({ over: [], ccFull: false });
    expect(validateMailDraft(ccOver, "THCS").cc).toBeDefined();
    const listOver = draftWith({ bgh: addrs("bgh", MAIL_MAX_RECIPIENTS + 1), cc: addrs("vp", 3) });
    expect(recipientCapacity(listOver, "THCS", [D]).over).toEqual([]);
    expect(validateMailDraft(listOver, "THCS").bgh).toBeDefined();
  });
});

describe("notices card", () => {
  const cls = (classCode: string, recipients: string[]): ReportMailClassRecipients => ({ classCode, grade: Number(classCode.slice(0, 1)), recipients, missing: recipients.length === 0 });

  it("counts the classes whose GVCN can receive a notice (missing ones in natural order)", () => {
    const c = noticeCoverage([cls("6A10", []), cls("6A02", ["gv.6a02@example.edu.vn"]), cls("6A9", []), { ...cls("7A01", ["x@example.edu.vn"]), missing: true }]);
    expect(c.total).toBe(4);
    expect(c.withEmail).toBe(1);
    expect(c.missing.map((m) => m.classCode)).toEqual(["6A9", "6A10", "7A01"]);
    expect(noticeCoverage([])).toEqual({ total: 0, withEmail: 0, missing: [] });
  });

  it("warns when notices are on but cannot reach anyone", () => {
    expect(noticesWarning({ enabled: false, incidents: false, rewards: false }, false)).toBeUndefined();
    expect(noticesWarning({ enabled: true, incidents: false, rewards: false }, true)).toContain("chưa chọn loại thông báo");
    expect(noticesWarning({ enabled: true, incidents: true, rewards: false }, false)).toContain("Chưa cấu hình gửi thư");
    expect(noticesWarning({ enabled: true, incidents: true, rewards: true }, true)).toBeUndefined();
  });
});
