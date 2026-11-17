/** "Gửi email" of Báo cáo tuần/tháng: rows, default selection, address editing, summary, validation, POST body. */
import { describe, expect, it } from "vitest";
import { MAIL_MAX_RECIPIENTS, MAIL_MAX_TARGETS, MAIL_NOTE_MAX } from "@/lib/constants";
import { ReportMailSendSchema } from "@/lib/contract";
import { planReportTargets } from "@/lib/server/mail/report-send";
import { buildPeriodReport } from "../../lib/report-model";
import {
  NOT_CONFIGURED_MESSAGE,
  NO_DOMAINS_MESSAGE,
  NO_TARGET_MESSAGE,
  PLAN_DIRTY_MESSAGE,
  addAddresses,
  addResultMessage,
  addressPreview,
  blockedNotice,
  canCheckRow,
  domainsUnknownNotice,
  classSelection,
  groupTargetRows,
  initialMailDraft,
  mailDraftIssues,
  mailSummary,
  mailSummaryText,
  mailTargetRows,
  onAddresses,
  removeAddress,
  reportMailInput,
  selectedTargets,
  selfCcProblem,
  sendBlockReason,
  setAddressOn,
  setClassesChecked,
  setTargetChecked,
  targetOf,
  withNewRows,
  type MailDraft,
} from "../lib/mail-draft";
import { reportPdfFileName, reportPdfQuery } from "../lib/report-pdf";
import { DOMAIN, SELF, mailFixture } from "./mail-fixtures";

const WEEK = { mode: "week", key: "2026-10-19" } as const;

function setup(selectedKey = "bgh", detail = false) {
  const { ds, options, res } = mailFixture();
  const rows = mailTargetRows(res, options, ds.classes);
  return { ds, res, rows, draft: initialMailDraft(rows, selectedKey, detail) };
}

describe("rows of the dialog", () => {
  it("follow the toolbar options: BGH, tổ khối, GVCN lớp (active classes only), normalised defaults", () => {
    const { rows } = setup();
    expect(rows.map((r) => r.key)).toEqual(["bgh", "khoi-6", "khoi-7", "lop-6A01", "lop-6A02", "lop-6A03", "lop-6A04", "lop-6A05", "lop-7A01", "lop-7A02", "lop-7A03"]);
    expect(rows[0]).toEqual({ key: "bgh", kind: "bgh", label: "Ban Giám hiệu", addressee: "Ban Giám hiệu", defaults: [`bgh.1@${DOMAIN}`, `bgh.2@${DOMAIN}`], missing: false });
    expect(rows[1]).toMatchObject({ kind: "grade", label: "Tổ khối 6", grade: 6, defaults: [`khoi6@${DOMAIN}`], missing: false });
    // A grade without a configured list is editable (not "missing").
    expect(rows[2]).toMatchObject({ kind: "grade", label: "Tổ khối 7", defaults: [], missing: false });
  });

  it("class rows: teacher from the response, else the dataset; no allowed address → missing", () => {
    const { rows, ds } = setup();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get("lop-6A01")).toMatchObject({ label: "6A01", addressee: "GVCN lớp 6A01", grade: 6, teacher: "GV Thử Một", missing: false });
    expect(byKey.get("lop-6A02")).toMatchObject({ missing: true, defaults: [] });
    // 7A03 is not in the response: grade + teacher from the dataset, no address.
    const cls = ds.classes.find((c) => c.code === "7A03");
    expect(byKey.get("lop-7A03")).toMatchObject({ grade: 7, teacher: cls?.homeroomTeacher, missing: true });
  });

  it("are grouped for the sections (classes by khối)", () => {
    const { rows } = setup();
    const g = groupTargetRows(rows);
    expect(g.bgh?.key).toBe("bgh");
    expect(g.grades.map((r) => r.key)).toEqual(["khoi-6", "khoi-7"]);
    expect(g.classes.map((c) => [c.label, c.rows.length])).toEqual([
      ["Khối 6", 5],
      ["Khối 7", 3],
    ]);
  });
});

describe("default selection", () => {
  it("checks only the toolbar recipient, every default address ticked, detail from the toolbar", () => {
    const { rows, draft } = setup("khoi-6", true);
    expect(selectedTargets(draft, rows)).toEqual([{ to: "khoi-6", recipients: [`khoi6@${DOMAIN}`] }]);
    expect(draft.detail).toBe(true);
    expect(draft.ccSelf).toBe(false);
    expect(targetOf(draft, "bgh")).toEqual({
      checked: false,
      addresses: [
        { email: `bgh.1@${DOMAIN}`, on: true, added: false },
        { email: `bgh.2@${DOMAIN}`, on: true, added: false },
      ],
    });
  });

  it("a toolbar recipient that cannot be sent (no GVCN email) leaves everything unchecked", () => {
    const { rows, draft } = setup("lop-6A02");
    expect(selectedTargets(draft, rows)).toEqual([]);
    expect(mailDraftIssues(draft, rows, []).message).toBe(NO_TARGET_MESSAGE);
  });

  it("rows loaded after an edit get their defaults; edited rows are kept", () => {
    const { rows } = setup();
    const early: MailDraft = { targets: {}, detail: false, ccSelf: true, note: "Nhắn" };
    const merged = withNewRows(early, initialMailDraft(rows, "bgh", false));
    expect(merged.note).toBe("Nhắn");
    expect(merged.ccSelf).toBe(true);
    expect(targetOf(merged, "bgh").checked).toBe(true);
    const full = initialMailDraft(rows, "bgh", false);
    expect(withNewRows(full, full)).toBe(full);
  });
});

describe("editing", () => {
  it("ticks targets and addresses; a row without address cannot be ticked", () => {
    const { rows, draft } = setup();
    const unticked = setAddressOn(draft, "bgh", `bgh.2@${DOMAIN}`, false);
    expect(selectedTargets(unticked, rows)).toEqual([{ to: "bgh", recipients: [`bgh.1@${DOMAIN}`] }]);
    expect(setAddressOn(unticked, "bgh", `bgh.2@${DOMAIN}`, false)).toBe(unticked);
    const none = setAddressOn(unticked, "bgh", `bgh.1@${DOMAIN}`, false);
    expect(mailDraftIssues(none, rows, [])).toEqual({ message: "Ban Giám hiệu: chưa chọn địa chỉ nhận", targets: { bgh: "Chưa chọn địa chỉ nhận" } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(canCheckRow(byKey.get("khoi-7")!, targetOf(draft, "khoi-7"))).toBe(false);
    expect(canCheckRow(byKey.get("lop-6A02")!, targetOf(draft, "lop-6A02"))).toBe(false);
    expect(setTargetChecked(draft, "bgh", true)).toBe(draft);
    // A checked row that cannot be sent (no address at all / no GVCN email) is ignored, not reported.
    const ghost = setTargetChecked(setTargetChecked(draft, "khoi-7", true), "lop-6A02", true);
    expect(mailDraftIssues(ghost, rows, [])).toEqual({ targets: {} });
    expect(selectedTargets(ghost, rows).map((t) => t.to)).toEqual(["bgh"]);
  });

  it("adds a pasted list: valid + allowed added and the row checked, the rest left in the input", () => {
    const { rows, draft } = setup();
    const res = addAddresses(draft, "khoi-7", `To Truong <TT.7@${DOMAIN}>; sai-dia-chi, ngoai@other.example.com\nkhoi7@${DOMAIN}`, [DOMAIN]);
    expect(res.added).toEqual([`tt.7@${DOMAIN}`, `khoi7@${DOMAIN}`]);
    expect(res.invalid).toEqual(["sai-dia-chi"]);
    expect(res.blocked).toEqual(["ngoai@other.example.com"]);
    expect(res.rest).toBe("sai-dia-chi, ngoai@other.example.com");
    expect(addResultMessage(res, [DOMAIN])).toBe(`Không phải địa chỉ email: sai-dia-chi. Ngoài tên miền được phép (chỉ gửi tới @${DOMAIN}): ngoai@other.example.com`);
    expect(targetOf(res.draft, "khoi-7")).toEqual({
      checked: true,
      addresses: [
        { email: `tt.7@${DOMAIN}`, on: true, added: true },
        { email: `khoi7@${DOMAIN}`, on: true, added: true },
      ],
    });
    expect(selectedTargets(res.draft, rows).map((t) => t.to)).toEqual(["bgh", "khoi-7"]);
  });

  it("adding an existing (unticked) address ticks it again; nothing valid → draft unchanged", () => {
    const { draft } = setup();
    const off = setAddressOn(draft, "bgh", `bgh.1@${DOMAIN}`, false);
    const res = addAddresses(off, "bgh", `BGH.1@${DOMAIN}`, [DOMAIN]);
    expect(onAddresses(targetOf(res.draft, "bgh"))).toEqual([`bgh.1@${DOMAIN}`, `bgh.2@${DOMAIN}`]);
    expect(targetOf(res.draft, "bgh").addresses).toHaveLength(2);
    const bad = addAddresses(draft, "bgh", "khong-hop-le", [DOMAIN]);
    expect(bad.draft).toBe(draft);
    expect(addResultMessage(bad, [DOMAIN])).toBe("Không phải địa chỉ email: khong-hop-le");
    expect(addResultMessage({ invalid: [], blocked: [] }, [DOMAIN])).toBeUndefined();
  });

  it("no allowed domain known: every typed address is refused, saying why", () => {
    const { draft } = setup();
    const res = addAddresses(draft, "khoi-7", `khoi7@${DOMAIN}, sai`, []);
    expect(res.draft).toBe(draft);
    expect(res.blocked).toEqual([`khoi7@${DOMAIN}`]);
    expect(addResultMessage(res, [])).toBe(`Không phải địa chỉ email: sai. Chưa xác định tên miền nhận thư nên chưa thêm được: khoi7@${DOMAIN}`);
  });

  it("removes only typed addresses; removing the last one unchecks the row", () => {
    const { draft } = setup();
    expect(removeAddress(draft, "bgh", `bgh.1@${DOMAIN}`)).toBe(draft);
    const added = addAddresses(draft, "khoi-7", `khoi7@${DOMAIN}`, [DOMAIN]).draft;
    const removed = removeAddress(added, "khoi-7", `khoi7@${DOMAIN}`);
    expect(targetOf(removed, "khoi-7")).toEqual({ checked: false, addresses: [] });
  });

  it("selects all classes (or one khối), skipping classes without GVCN email", () => {
    const { rows, draft } = setup();
    expect(classSelection(draft, rows)).toEqual({ total: 6, checked: 0, state: false });
    const all = setClassesChecked(draft, rows, true);
    expect(classSelection(all, rows)).toEqual({ total: 6, checked: 6, state: true });
    expect(selectedTargets(all, rows).map((t) => t.to)).toEqual(["bgh", "lop-6A01", "lop-6A03", "lop-6A04", "lop-6A05", "lop-7A01", "lop-7A02"]);
    const k7 = setClassesChecked(draft, rows, true, 7);
    expect(classSelection(k7, rows)).toEqual({ total: 6, checked: 2, state: "indeterminate" });
    expect(classSelection(k7, rows, 7)).toEqual({ total: 2, checked: 2, state: true });
    expect(classSelection(setClassesChecked(all, rows, false), rows).checked).toBe(0);
  });
});

describe("summary, validation and the POST body", () => {
  it("counts emails and distinct people (to + CC, the sender when 'Gửi bản sao cho tôi')", () => {
    const { rows, res, draft } = setup();
    const d = setClassesChecked(draft, rows, true, 6);
    const s = mailSummary(d, rows, res.cc);
    // bgh (2) + 6A01 (1) + 6A03 (2) + 6A04 + 6A05 + CC văn thư.
    expect(s).toEqual({ messages: 5, recipients: 8, cc: [`vanthu@${DOMAIN}`] });
    expect(mailSummaryText(s)).toBe("Sẽ gửi 5 thư · 8 người nhận");
    const withSelf = mailSummary({ ...d, ccSelf: true }, rows, res.cc, SELF.toUpperCase());
    expect(withSelf.cc).toEqual([`vanthu@${DOMAIN}`, SELF]);
    expect(withSelf.recipients).toBe(9);
    // The same address in two emails is one person.
    const dup = addAddresses(d, "khoi-6", `bgh.1@${DOMAIN}`, [DOMAIN]).draft;
    expect(mailSummary(dup, rows, res.cc)).toMatchObject({ messages: 6, recipients: 9 });
    const none = setTargetChecked(draft, "bgh", false);
    expect(mailSummary(none, rows, res.cc)).toEqual({ messages: 0, recipients: 0, cc: [`vanthu@${DOMAIN}`] });
    expect(mailSummaryText(mailSummary(none, rows, res.cc))).toBe("Chưa chọn người nhận");
  });

  it("validates the limits of the contract", () => {
    const { rows, draft } = setup();
    expect(mailDraftIssues(draft, rows, [])).toEqual({ targets: {} });
    const many = Array.from({ length: MAIL_MAX_RECIPIENTS }, (_, i) => `nguoi${i}@${DOMAIN}`).join(", ");
    const tooMany = addAddresses(draft, "bgh", many, [DOMAIN]).draft;
    expect(mailDraftIssues(tooMany, rows, [])).toEqual({
      message: `Ban Giám hiệu: tối đa ${MAIL_MAX_RECIPIENTS} địa chỉ nhận mỗi thư`,
      targets: { bgh: `Tối đa ${MAIL_MAX_RECIPIENTS} địa chỉ nhận mỗi thư` },
    });
    const longNote = { ...draft, note: "x".repeat(MAIL_NOTE_MAX + 1) };
    expect(mailDraftIssues(longNote, rows, []).message).toBe(`Lời nhắn tối đa ${MAIL_NOTE_MAX} ký tự`);
    // More rows than one send accepts.
    const manyRows = Array.from({ length: MAIL_MAX_TARGETS + 1 }, (_, i) => ({
      key: `lop-X${i}`,
      kind: "class" as const,
      label: `X${i}`,
      addressee: `GVCN lớp X${i}`,
      defaults: [`gv.x${i}@${DOMAIN}`],
      missing: false,
    }));
    const big = setClassesChecked(initialMailDraft(manyRows, "", false), manyRows, true);
    expect(mailDraftIssues(big, manyRows, []).message).toBe(`Tối đa ${MAIL_MAX_TARGETS} thư mỗi lần gửi`);
  });

  it("counts the CC of every email in the per-email limit, like the server (CC already in To once, normalised)", () => {
    const { rows, draft } = setup();
    // Ban Giám hiệu: 2 defaults + 46 typed = 48 addresses.
    const more = Array.from({ length: MAIL_MAX_RECIPIENTS - 4 }, (_, i) => `nguoi${i}@${DOMAIN}`).join(", ");
    const d = addAddresses(draft, "bgh", more, [DOMAIN]).draft;
    const to = onAddresses(targetOf(d, "bgh"));
    expect(to).toHaveLength(MAIL_MAX_RECIPIENTS - 2);
    const cc = [`vanthu@${DOMAIN}`, `ketoan@${DOMAIN}`, `yte@${DOMAIN}`];
    const issue = `Tối đa ${MAIL_MAX_RECIPIENTS} người nhận mỗi thư (kể cả 3 người nhận bản sao)`;
    const over = mailDraftIssues(d, rows, cc);
    expect(over).toEqual({ message: `Ban Giám hiệu: tối đa ${MAIL_MAX_RECIPIENTS} người nhận mỗi thư (kể cả 3 người nhận bản sao)`, targets: { bgh: issue } });
    expect(sendBlockReason({ recipients: "ready", configured: true, domainsKnown: true, planDirty: false, issues: over })).toBe(over.message);
    // Only the row over the limit: the classes (1–2 addresses + 3 CC) are fine.
    expect(mailDraftIssues(setClassesChecked(d, rows, true), rows, cc).targets).toEqual({ bgh: issue });
    // 48 + 2 = 50 is accepted; a CC address already in To counts once; CC compared normalised and deduplicated.
    for (const ok of [cc.slice(0, 2), [`BGH.1@${DOMAIN}`, `nguoi0@${DOMAIN}`, ...cc.slice(0, 2)], [` VanThu@${DOMAIN} `, `vanthu@${DOMAIN}`, `ketoan@${DOMAIN}`]]) {
      expect(mailDraftIssues(d, rows, ok)).toEqual({ targets: {} });
    }
    // "Gửi bản sao cho tôi": the dialog passes mailSummary(...).cc, which adds the sender.
    const withSelf: MailDraft = { ...d, ccSelf: true };
    expect(mailDraftIssues(withSelf, rows, mailSummary(withSelf, rows, cc.slice(0, 2), SELF).cc).targets).toEqual({ bgh: issue });

    // Same verdict as the server (report-send.ts planReportTargets), which refuses the whole batch.
    const refused = (settingsCc: string[], selfCc?: string) => {
      try {
        planReportTargets([{ to: "bgh", addressee: "Ban Giám hiệu", recipients: to }], { domains: [DOMAIN], settingsCc, selfCc });
        return false;
      } catch {
        return true;
      }
    };
    expect(refused(cc)).toBe(true);
    expect(refused(cc.slice(0, 2))).toBe(false);
    expect(refused(cc.slice(0, 2), SELF)).toBe(true);
    expect(refused([`BGH.1@${DOMAIN}`, `nguoi0@${DOMAIN}`, ...cc.slice(0, 2)])).toBe(false);
  });

  it("builds a body accepted by ReportMailSendSchema (note trimmed, omitted when blank)", () => {
    const { rows, draft } = setup("bgh", true);
    const d = { ...setTargetChecked(draft, "lop-6A03", true), ccSelf: true, note: "  Kính gửi thầy cô.\n " };
    const input = reportMailInput("THCS", WEEK, d, rows);
    expect(input).toEqual({
      levelId: "THCS",
      mode: "week",
      key: "2026-10-19",
      detail: true,
      ccSelf: true,
      note: "Kính gửi thầy cô.",
      targets: [
        { to: "bgh", recipients: [`bgh.1@${DOMAIN}`, `bgh.2@${DOMAIN}`] },
        { to: "lop-6A03", recipients: [`gv.6a03@${DOMAIN}`, `pho.6a03@${DOMAIN}`] },
      ],
    });
    expect(ReportMailSendSchema.safeParse(input).success).toBe(true);
    const blank = reportMailInput("THCS", { mode: "month", key: "2026-10" }, { ...draft, note: "   " }, rows);
    expect("note" in blank).toBe(false);
    expect(ReportMailSendSchema.safeParse(blank).success).toBe(true);
  });

  it("explains why 'Gửi' is disabled, in priority order", () => {
    const ok = { recipients: "ready", configured: true, domainsKnown: true, planDirty: false, issues: {} } as const;
    expect(sendBlockReason(ok)).toBeUndefined();
    expect(sendBlockReason({ ...ok, recipients: "loading" })).toBe("Đang tải danh sách người nhận…");
    expect(sendBlockReason({ ...ok, recipients: "error", configured: false })).toBe("Chưa tải được danh sách người nhận");
    expect(sendBlockReason({ ...ok, configured: false, planDirty: true })).toBe(NOT_CONFIGURED_MESSAGE);
    expect(sendBlockReason({ ...ok, planDirty: true, issues: { message: NO_TARGET_MESSAGE } })).toBe(PLAN_DIRTY_MESSAGE);
    expect(sendBlockReason({ ...ok, issues: { message: NO_TARGET_MESSAGE } })).toBe(NO_TARGET_MESSAGE);
    // No allowed recipient domain: after "not configured", before the plan and the draft (nothing could be sent).
    expect(sendBlockReason({ ...ok, domainsKnown: false, planDirty: true, issues: { message: NO_TARGET_MESSAGE } })).toBe(NO_DOMAINS_MESSAGE);
    expect(sendBlockReason({ ...ok, configured: false, domainsKnown: false })).toBe(NOT_CONFIGURED_MESSAGE);
    expect(sendBlockReason({ ...ok, recipients: "loading", domainsKnown: false })).toBe("Đang tải danh sách người nhận…");
  });
});

describe("texts", () => {
  it("self copy needs an allowed own address", () => {
    expect(selfCcProblem(SELF, [DOMAIN])).toBeUndefined();
    expect(selfCcProblem(" Nguoigui@Example.edu.vn ", [DOMAIN])).toBeUndefined();
    expect(selfCcProblem(undefined, [DOMAIN])).toBe("Tài khoản của bạn chưa có địa chỉ email.");
    expect(selfCcProblem("ai@other.example.com", [DOMAIN])).toBe("Email của bạn (ai@other.example.com) không thuộc tên miền được phép nhận thư.");
    expect(selfCcProblem(SELF, [])).toBe("Chưa xác định tên miền nhận thư.");
  });

  it("no allowed domain known: explains why nothing can be sent and where to fix it", () => {
    const admin = domainsUnknownNotice(true, 3);
    expect(admin).toContain("chưa có “Tên miền được phép” và chưa khai báo hộp thư gửi");
    expect(admin).toContain("(kể cả 3 địa chỉ đã lưu trong cài đặt) đều bị chặn và chưa gửi được báo cáo");
    expect(admin).toContain("Mở Cài đặt → Email, nhập “Tên miền được phép”");
    const editor = domainsUnknownNotice(false, 0);
    expect(editor).toBe(
      "Cài đặt gửi thư chưa có tên miền nhận thư, nên mọi địa chỉ đều bị chặn và chưa gửi được báo cáo. Vui lòng liên hệ quản trị viên để khai báo “Tên miền được phép” trong Cài đặt → Email.",
    );
  });

  it("previews addresses and the blocked ones", () => {
    expect(addressPreview([])).toBe("Chưa có địa chỉ");
    expect(addressPreview(["a@example.edu.vn", "b@example.edu.vn"])).toBe("a@example.edu.vn, b@example.edu.vn");
    expect(addressPreview(["a@example.edu.vn", "b@example.edu.vn", "c@example.edu.vn", "d@example.edu.vn"])).toBe("a@example.edu.vn, b@example.edu.vn và 2 địa chỉ khác");
    expect(blockedNotice([])).toBeUndefined();
    expect(blockedNotice(["a@example.com", "b@example.com"], 1)).toBe("2 địa chỉ trong cài đặt không thuộc tên miền được phép nên không được gửi: a@example.com, …");
    // Without any domain every address is "blocked": the domain notice explains it instead of listing them all.
    expect(blockedNotice(["a@example.com"], 5, false)).toBeUndefined();
  });
});

describe("Tải PDF", () => {
  it("queries the report on screen and names the file like the print / Excel exports", () => {
    const { ds } = mailFixture();
    const report = buildPeriodReport(ds, { period: WEEK, recipient: { kind: "grade", grade: 6 } }, "2026-10-21");
    expect(reportPdfQuery(report, true)).toEqual({ level: "THCS", mode: "week", key: "2026-10-19", to: "khoi-6", detail: "1" });
    expect(reportPdfQuery(report, false)?.detail).toBe("0");
    expect(reportPdfQuery({ ...report, period: { mode: "semester", key: "HK1" } }, false)).toBeUndefined();
    expect(reportPdfFileName(report)).toBe("NSHM_Bao-cao_THCS_Tuan-19-10_25-10-2026_Khoi-6.pdf");
  });
});
