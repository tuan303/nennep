/** Shared test data of the "Gửi email" dialog (fake addresses only). */
import { makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { MailBatchResponse, ReportMailRecipientsResponse } from "@/lib/contract";
import { recipientOptions } from "../../lib/report-model";

export const DOMAIN = "example.edu.vn";
export const SELF = "nguoigui@example.edu.vn";

export function mailFixture() {
  const ds = makeFixtureDataset();
  // ADMIN: bgh, khoi-6, khoi-7, lop-6A01…6A05, lop-7A01…7A03 (7A04 is inactive).
  const options = recipientOptions({ role: "ADMIN", gvcnClasses: [] }, ds);
  const res: ReportMailRecipientsResponse = {
    status: {
      configured: true,
      sender: `nennep@${DOMAIN}`,
      senderName: "Nền nếp NSHM",
      allowedDomains: [DOMAIN],
      baseUrl: "https://nennep.example.edu.vn",
      missing: [],
    },
    bgh: [`bgh.1@${DOMAIN}`, `BGH.2@${DOMAIN}`],
    cc: [`vanthu@${DOMAIN}`],
    grades: [{ grade: 6, recipients: [`khoi6@${DOMAIN}`] }],
    classes: [
      { classCode: "6A01", grade: 6, teacher: "GV Thử Một", recipients: [`gv.6a01@${DOMAIN}`], missing: false },
      { classCode: "6A02", grade: 6, recipients: [], missing: true },
      { classCode: "6A03", grade: 6, recipients: [`gv.6a03@${DOMAIN}`, `pho.6a03@${DOMAIN}`], missing: false },
      { classCode: "6A04", grade: 6, recipients: [`gv.6a04@${DOMAIN}`], missing: false },
      { classCode: "6A05", grade: 6, recipients: [`gv.6a05@${DOMAIN}`], missing: false },
      { classCode: "7A01", grade: 7, recipients: [`gv.7a01@${DOMAIN}`], missing: false },
      { classCode: "7A02", grade: 7, recipients: [`gv.7a02@${DOMAIN}`], missing: false },
    ],
    blocked: ["ngoai@other.example.com"],
  };
  return { ds, options, res };
}

export function batchFixture(overrides: Partial<MailBatchResponse> = {}): MailBatchResponse {
  return {
    batchId: "b1",
    items: [
      { id: "j1", to: [`bgh.1@${DOMAIN}`], addressee: "Ban Giám hiệu", status: "SENT", sentAt: "2026-10-23T07:05:00.000Z" },
      { id: "j2", to: [`khoi6@${DOMAIN}`], addressee: "Tổ khối 6", status: "FAILED", lastError: "Máy chủ thư từ chối." },
      { id: "j3", to: [`gv.6a01@${DOMAIN}`], addressee: "GVCN lớp 6A01", status: "PENDING" },
    ],
    counts: { PENDING: 1, SENDING: 0, SENT: 1, FAILED: 1, SKIPPED: 0 },
    done: false,
    ...overrides,
  };
}
