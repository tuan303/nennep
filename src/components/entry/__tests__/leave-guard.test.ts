/**
 * UX-1 regression: unsaved incident / reward input is protected (link clicks that leave the page are detected, other
 * leave actions can ask first, and dropped forms are kept in this tab's memory per user + level + record version).
 * UX-17: the date hint of the incident form.
 */
import { describe, expect, it, vi } from "vitest";
import { FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import { newRewardForm, rewardDraftKey, rewardFormDirty } from "@/components/rewards/lib/reward-form";
import { DATE_HINT, entryDateHint, entryDraftKey, entryFormDirty, formFromIncident, freshEntryForm, newEntryForm, nextEntryForm, type EntryForm } from "../lib/form-model";
import { createDraftMemory, hasUnsavedInput, leavingHref, registerLeaveHandler, requestLeave, type AnchorLike, type ClickLike } from "../lib/leave-guard";
import type { Incident } from "@/lib/types";

const ORIGIN = "https://nennep.nshm.edu.vn";
const click = (patch: Partial<ClickLike> = {}): ClickLike => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...patch });
const link = (href: string, patch: Partial<AnchorLike> = {}): AnchorLike => ({ href: new URL(href, ORIGIN).href, target: "", hasDownload: false, ...patch });

describe("leavingHref", () => {
  const here = `${ORIGIN}/nhap-lieu`;

  it("detects in-app links that replace the page (sidebar, bottom nav, Recent 'Sửa')", () => {
    expect(leavingHref(click(), link("/"), here)).toBe("/");
    expect(leavingHref(click(), link("/nhap-lieu?edit=THCS_NN-20261021-0001"), here)).toBe("/nhap-lieu?edit=THCS_NN-20261021-0001");
    // Bottom-nav "+" while editing clears ?edit → the edit form would be dropped.
    expect(leavingHref(click(), link("/nhap-lieu"), `${ORIGIN}/nhap-lieu?edit=x`)).toBe("/nhap-lieu");
    expect(leavingHref(click(), link("/xep-hang?mode=week#top"), here)).toBe("/xep-hang?mode=week#top");
  });

  it("ignores clicks that keep the page or open elsewhere", () => {
    expect(leavingHref(click(), link("/nhap-lieu"), here)).toBeNull(); // the "+" tab of the current page
    expect(leavingHref(click(), link("/nhap-lieu#buoc-5"), here)).toBeNull();
    expect(leavingHref(click({ ctrlKey: true }), link("/"), here)).toBeNull();
    expect(leavingHref(click({ metaKey: true }), link("/"), here)).toBeNull();
    expect(leavingHref(click({ button: 1 }), link("/"), here)).toBeNull();
    expect(leavingHref(click({ defaultPrevented: true }), link("/"), here)).toBeNull();
    expect(leavingHref(click(), link("/", { target: "_blank" }), here)).toBeNull();
    expect(leavingHref(click(), link("/bao-cao.xlsx", { hasDownload: true }), here)).toBeNull();
    expect(leavingHref(click(), link("https://zalo.me/abc"), here)).toBeNull(); // leaving the app: beforeunload asks
    expect(leavingHref(click(), { href: "mailto:bgh@nshm.edu.vn", target: "", hasDownload: false }, here)).toBeNull();
    expect(leavingHref(click(), link("/", { target: "_self" }), here)).toBe("/");
  });
});

describe("requestLeave", () => {
  it("proceeds at once without an active guard", () => {
    const proceed = vi.fn();
    expect(hasUnsavedInput()).toBe(false);
    requestLeave(proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("lets the active guard decide (e.g. the level switcher asks before switching)", () => {
    let asked: (() => void) | undefined;
    const unregister = registerLeaveHandler((p) => {
      asked = p;
    });
    expect(hasUnsavedInput()).toBe(true);
    const proceed = vi.fn();
    requestLeave(proceed);
    expect(proceed).not.toHaveBeenCalled(); // the dialog is open
    asked?.(); // "Bỏ và rời trang"
    expect(proceed).toHaveBeenCalledTimes(1);
    unregister();
    expect(hasUnsavedInput()).toBe(false);
  });
});

describe("draft memory", () => {
  it("keeps drafts per key and forgets other users' drafts", () => {
    const mem = createDraftMemory<{ v: number }>();
    mem.write("u1|THCS|new", { v: 1 });
    mem.write("u1|THPT|new", { v: 2 });
    expect(mem.read("u1|THCS|new")).toEqual({ v: 1 });
    expect(mem.hasPrefix("u1|THPT|")).toBe(true);
    mem.clear("u1|THPT|new");
    expect(mem.hasPrefix("u1|THPT|")).toBe(false);
    mem.write("u2|THCS|new", { v: 3 }); // another account on the same tab
    expect(mem.read("u1|THCS|new")).toBeUndefined();
    expect(mem.read("u2|THCS|new")).toEqual({ v: 3 });
  });

  it("keys incident drafts by user, level and record version", () => {
    expect(entryDraftKey(undefined, "THCS")).toBeUndefined();
    expect(entryDraftKey("u1", "THCS")).toBe("u1|THCS|new");
    const rec = { id: "THCS_NN-1", createdAt: "2026-10-21T01:00:00.000Z" };
    expect(entryDraftKey("u1", "THCS", rec)).toBe("u1|THCS|edit:THCS_NN-1@2026-10-21T01:00:00.000Z");
    // Updated elsewhere since → an older draft is never restored over it.
    expect(entryDraftKey("u1", "THCS", { ...rec, updatedAt: "2026-10-21T02:00:00.000Z" })).toBe("u1|THCS|edit:THCS_NN-1@2026-10-21T02:00:00.000Z");
    expect(rewardDraftKey("u1", "THCS")).toBe("u1|THCS|reward:new");
  });
});

describe("dirty detection", () => {
  const blank = newEntryForm({ today: FIXTURE_TODAY, reporter: "Cô Lan" });
  const typed = (patch: Partial<EntryForm>) => ({ ...blank, ...patch });

  it("flags any input that would be lost", () => {
    expect(entryFormDirty(blank, blank)).toBe(false);
    expect(entryFormDirty(typed({ classCode: "6A03" }), blank)).toBe(true);
    expect(entryFormDirty(typed({ errorCode: "L01" }), blank)).toBe(true);
    expect(entryFormDirty(typed({ studentIds: ["26060301"] }), blank)).toBe(true);
    expect(entryFormDirty(typed({ unnamedCount: 2 }), blank)).toBe(true);
    expect(entryFormDirty(typed({ detail: "7h20 tại cổng" }), blank)).toBe(true);
    expect(entryFormDirty(typed({ photoIds: ["ev1"] }), blank)).toBe(true);
    expect(entryFormDirty(typed({ links: ["https://drive.google.com/x"] }), blank)).toBe(true);
    expect(entryFormDirty(typed({ status: "Đang xử lý" }), blank)).toBe(true);
  });

  it("ignores whitespace, empty link boxes and the scope-touched flag", () => {
    expect(entryFormDirty(typed({ detail: "   ", reporter: " Cô Lan ", links: ["", "  "], scopeTouched: true }), blank)).toBe(false);
  });

  it("is clean again after a save (the new form becomes the baseline)", () => {
    const filled = typed({ classCode: "6A03", errorCode: "L01", studentIds: ["26060301"], detail: "abc" });
    const next = nextEntryForm(filled);
    expect(entryFormDirty(next, next)).toBe(false);
    const fresh = freshEntryForm(filled, FIXTURE_TODAY);
    expect(entryFormDirty(fresh, fresh)).toBe(false);
  });

  it("compares an edit with the record", () => {
    const rec = { date: "2026-10-20", classCode: "6A03", errorCode: "L01", scope: "Cá nhân", students: [{ id: "26060301", name: "Phạm Thiện Khôi", classCode: "6A03" }], unnamedCount: 0, occurrenceCount: 1, detail: "x", reporter: "Cô Lan", status: "Mới ghi nhận", photoIds: [], evidenceUrls: [] } as unknown as Incident;
    const base = formFromIncident(rec);
    expect(entryFormDirty(base, base)).toBe(false);
    expect(entryFormDirty({ ...base, studentIds: [] }, base)).toBe(true);
  });

  it("flags reward input", () => {
    const r = newRewardForm({ today: FIXTURE_TODAY, reporter: "Cô Lan" });
    expect(rewardFormDirty(r, r)).toBe(false);
    expect(rewardFormDirty({ ...r, reason: "  " }, r)).toBe(false);
    expect(rewardFormDirty({ ...r, classCode: "6A01" }, r)).toBe(true);
    expect(rewardFormDirty({ ...r, reason: "Lớp sạch đẹp tiêu biểu" }, r)).toBe(true);
    expect(rewardFormDirty({ ...r, points: 10 }, r)).toBe(true);
    expect(rewardFormDirty({ ...r, photoIds: ["ev"] }, r)).toBe(true);
  });
});

describe("entryDateHint (UX-17)", () => {
  it("asks for a date when the picker was cleared", () => {
    expect(entryDateHint("", FIXTURE_TODAY)).toEqual({ hint: DATE_HINT.empty });
  });

  it("marks a future or malformed date as an error next to the field", () => {
    expect(entryDateHint("2026-10-22", FIXTURE_TODAY)).toEqual({ error: DATE_HINT.future });
    expect(entryDateHint("2026-13-40", FIXTURE_TODAY)).toEqual({ error: DATE_HINT.invalid });
  });

  it("shows the weekday (and 'hôm nay') for a valid date", () => {
    expect(entryDateHint(FIXTURE_TODAY, FIXTURE_TODAY)).toEqual({ hint: "Thứ Tư · hôm nay" });
    expect(entryDateHint("2026-10-19", FIXTURE_TODAY)).toEqual({ hint: "Thứ Hai" });
  });
});

describe("leavingHref with page-specific rules", () => {
  it("entry form: only a change of ?edit= swaps the form", async () => {
    const { sameParam } = await import("../lib/leave-guard");
    const keeps = sameParam("edit");
    expect(leavingHref(click(), link("/nhap-lieu?edit=a"), `${ORIGIN}/nhap-lieu`, keeps)).toBe("/nhap-lieu?edit=a");
    expect(leavingHref(click(), link("/nhap-lieu"), `${ORIGIN}/nhap-lieu?edit=a`, keeps)).toBe("/nhap-lieu");
    expect(leavingHref(click(), link("/nhap-lieu?edit=a&x=1"), `${ORIGIN}/nhap-lieu?edit=a`, keeps)).toBeNull();
  });

  it("rewards / settings: filter or tab links keep the page", async () => {
    const { SAME_PATH } = await import("../lib/leave-guard");
    expect(leavingHref(click(), link("/diem-thuong?mode=all"), `${ORIGIN}/diem-thuong?mode=week`, SAME_PATH)).toBeNull();
    expect(leavingHref(click(), link("/cai-dat?tab=lop"), `${ORIGIN}/cai-dat?tab=cau-hinh`, SAME_PATH)).toBeNull();
    expect(leavingHref(click(), link("/nhap-lieu"), `${ORIGIN}/diem-thuong`, SAME_PATH)).toBe("/nhap-lieu");
  });
});
