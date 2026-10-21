/** Student record history (StudentEvent[]) → timeline items for the profile sheet (pure – unit-tested). */
import type { Tone } from "@/components/ui";
import { LEVELS, STUDENT_STATUS_LABELS } from "@/lib/constants";
import type { StudentEvent, StudentStatus } from "@/lib/types";
import { EVENT_META } from "./labels";

export interface TimelineItem {
  key: string;
  type: StudentEvent["type"];
  /** "Chuyển lớp 6A01 → 6A02" */
  title: string;
  /** Note / reason, if any. */
  detail?: string;
  /** Effective date yyyy-mm-dd. */
  date: string;
  /** Actor email. */
  by: string;
  /** ISO timestamp of the record. */
  at: string;
  tone: Tone;
}

const LEAVE_TITLES: Record<Exclude<StudentStatus, "ACTIVE">, string> = {
  TRANSFERRED_OUT: "Chuyển trường đi",
  GRADUATED: "Tốt nghiệp",
  INACTIVE: "Ngừng theo dõi",
};

/**
 * TRANSFER_OUT notes start with the status label ("Đã tốt nghiệp – Hoàn thành chương trình").
 * Returns the matching title and the rest of the note.
 */
function splitLeaveNote(note: string | undefined): { title: string; detail?: string } {
  const text = note?.trim() ?? "";
  for (const status of Object.keys(LEAVE_TITLES) as Array<keyof typeof LEAVE_TITLES>) {
    const label = STUDENT_STATUS_LABELS[status];
    if (text === label) return { title: LEAVE_TITLES[status] };
    if (text.startsWith(`${label} – `)) return { title: LEAVE_TITLES[status], detail: text.slice(label.length + 3).trim() || undefined };
  }
  return { title: LEAVE_TITLES.TRANSFERRED_OUT, detail: text || undefined };
}

function classPart(prefix: string, code: string | undefined): string {
  return code ? `${prefix} ${code}` : "";
}

export function describeEvent(e: StudentEvent): { title: string; detail?: string } {
  const note = e.note?.trim() || undefined;
  switch (e.type) {
    case "ENROLL":
      return { title: `Tuyển mới${classPart(" vào lớp", e.toClass)}`, detail: note };
    case "TRANSFER_IN":
      // Chuyển cấp (same Mã HS, e.g. TH → THCS). The server note keeps the previous status ("Chuyển cấp từ Tiểu học (Đã tốt nghiệp)").
      if (e.fromLevel && e.toLevel && e.fromLevel !== e.toLevel) {
        return {
          title: `Chuyển cấp ${LEVELS[e.fromLevel].short}${e.fromClass ? ` (lớp ${e.fromClass})` : ""} → ${LEVELS[e.toLevel].short}${classPart(", vào lớp", e.toClass)}`,
          detail: note,
        };
      }
      return { title: `Chuyển đến${classPart(" lớp", e.toClass)}`, detail: note };
    case "TRANSFER_CLASS":
      return { title: e.fromClass && e.toClass ? `Chuyển lớp ${e.fromClass} → ${e.toClass}` : `Chuyển lớp${classPart("", e.toClass)}`, detail: note };
    case "TRANSFER_OUT": {
      const { title, detail } = splitLeaveNote(e.note);
      return { title: e.fromClass ? `${title} (lớp ${e.fromClass})` : title, detail };
    }
    case "REINSTATE":
      return { title: `Khôi phục${classPart(" vào lớp", e.toClass)}`, detail: note };
    case "UPDATE":
      return { title: "Cập nhật thông tin", detail: note };
    case "IMPORT":
      // Server note: "Nhập từ danh sách học sinh[ – <trạng thái trong file>]" – keep only the extra part.
      return { title: `Nhập từ danh sách${classPart(", lớp", e.toClass)}`, detail: note?.replace(/^Nhập từ danh sách học sinh(\s*–\s*)?/, "").trim() || undefined };
    default:
      return { title: "Thay đổi hồ sơ", detail: note };
  }
}

/** Newest first: effective date, then record time. */
export function studentTimeline(history: readonly StudentEvent[]): TimelineItem[] {
  return history
    .map((e, i) => {
      const { title, detail } = describeEvent(e);
      return { key: `${e.at}-${i}`, type: e.type, title, detail, date: e.date, by: e.by, at: e.at, tone: EVENT_META[e.type]?.tone ?? "muted" };
    })
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
