/**
 * Small FICTIONAL guide content for the renderer tests (the real content lives in ../content).
 * No real names, codes or contacts – the repository is public.
 */
import type { GuideContent } from "../types";

export const FIXTURE_GUIDE: GuideContent = {
  updated: "22/10/2026",
  intro: "Tài liệu mẫu cho kiểm thử: **NSHM Nền nếp** giúp ghi nhận và theo dõi nền nếp.",
  quickStarts: [
    {
      role: "EDITOR",
      title: "Ghi nhận sự việc đầu tiên",
      description: "Các bước cho cán bộ nền nếp.",
      steps: ["Mở [Nhập liệu](/nhap-lieu).", "Chọn lớp `6A01` và lỗi.", "Bấm [[Lưu]]."],
      sectionIds: ["nhap-lieu", "khong-co-muc-nay"],
    },
    {
      role: "GVCN",
      title: "Theo dõi lớp chủ nhiệm",
      description: "Các bước cho giáo viên chủ nhiệm.",
      steps: ["Mở [Báo GVCN](/bao-gvcn)."],
      sectionIds: ["xep-hang"],
    },
  ],
  sections: [
    {
      id: "xep-hang",
      title: "Xếp hạng thi đua",
      icon: "Trophy",
      group: "xem",
      roles: "all",
      route: "/xep-hang",
      summary: "Bảng **Xếp hạng** theo từng khối.",
      blocks: [
        { kind: "p", text: "Điểm thi đua = điểm nền + điểm thưởng − điểm trừ." },
        { kind: "demo", demo: "top90", caption: "Lớp mẫu, số liệu mẫu." },
        { kind: "table", head: ["Cột", "Ý nghĩa"], rows: [["Điểm nền", "Điểm cho mỗi tuần được tính"], ["Top 90%", "Nhóm lớp đứng đầu khối"]], caption: "Các cột chính." },
      ],
    },
    {
      id: "nhap-lieu",
      title: "Nhập sự việc",
      icon: "ClipboardPen",
      group: "ghinhan",
      roles: ["ADMIN", "EDITOR"],
      route: "/nhap-lieu?tab=su-viec",
      summary: "Ghi nhận nhanh trên điện thoại.",
      blocks: [
        { kind: "steps", title: "Các bước", items: ["Chọn **lớp**.", "Chọn lỗi.", "Bấm [[Lưu]]."] },
        { kind: "tip", text: "Dùng [[Lưu & nhập tiếp]] khi ghi nhiều sự việc." },
        { kind: "warn", title: "Kiểm tra trước khi lưu", text: "Học sinh phải thuộc đúng lớp." },
        { kind: "demo", demo: "formula" },
      ],
    },
    {
      id: "loi-thuong-gap",
      title: "Khi không đăng nhập được",
      icon: "KhongCoIconNay",
      group: "hoidap",
      roles: "all",
      summary: "Một số cách xử lý.",
      blocks: [{ kind: "list", items: ["Kiểm tra mạng.", "Liên hệ quản trị."] }, { kind: "note", text: "Không tự đăng ký tài khoản." }],
    },
  ],
  faq: [
    { q: "Điểm thưởng tính khi nào?", a: "Khi ở trạng thái **Đã xác nhận**.", sectionId: "xep-hang" },
    { q: "Ai được nhập sự việc?", a: "Cán bộ nền nếp và quản trị." },
  ],
  glossary: [
    { term: "Sự việc", definition: "Một lần ghi nhận nền nếp (mã `NN-…`)." },
    { term: "Lượt vi phạm", definition: "Số học sinh liên quan của lỗi /HS." },
  ],
};
