/**
 * Hướng dẫn sử dụng – lời giới thiệu và 4 lộ trình bắt đầu nhanh theo vai trò
 * (Cán bộ nền nếp, GVCN, Ban Giám hiệu/Người xem, Quản trị).
 */
import type { GuideContent } from "../types";

export const UPDATED = "23/10/2026";

export const INTRO =
  "Phần mềm **Nền nếp** giúp Trường Ngôi Sao Hoàng Mai ghi nhận, chấm điểm và đánh giá nền nếp học sinh ở cả ba cấp Tiểu học, THCS và THPT. Cán bộ nền nếp ghi sự việc ngay trên điện thoại, điểm trừ và xếp hạng thi đua được tính tự động, GVCN nhận báo cáo và phản hồi cho lớp mình, Ban Giám hiệu theo dõi tình hình qua các chỉ số, cảnh báo và báo cáo định kỳ. Hãy bắt đầu với lộ trình dành cho vai trò của thầy/cô bên dưới, rồi tra cứu từng màn hình khi cần.";

export const QUICK_STARTS: GuideContent["quickStarts"] = [
  {
    role: "EDITOR",
    title: "Cán bộ nền nếp",
    description: "Ghi nhận sự việc ngay trên điện thoại, ghi đợt kiểm tra, điểm thưởng và rà soát dữ liệu hằng tuần.",
    steps: [
      "Đăng nhập và chọn đúng cấp học ở thanh trên cùng (Tiểu học – vàng, THCS – xanh lá, THPT – xanh navy).",
      "Trên điện thoại, bấm nút tròn vàng [[Nhập]] ở giữa thanh menu dưới để mở [Nhập liệu](/nhap-lieu).",
      "Đi lần lượt 7 bước: Ngày & lớp → Lỗi vi phạm → Phạm vi → Học sinh liên quan → kiểm tra Điểm trừ → Chi tiết → Minh chứng ([[Chụp ảnh]]).",
      "Bấm [[Lưu & nhập tiếp]] nếu còn ghi tiếp cùng lớp, hoặc [[Lưu]] khi xong. Ghi nhầm thì sửa trong 24 giờ ở khung **Ghi nhận gần đây**.",
      "Sau mỗi buổi kiểm tra, mở tab [Đợt kiểm tra](/nhap-lieu?tab=kiem-tra) và ghi các lớp đã được kiểm tra.",
      "Ghi điểm thưởng tập thể ở [Điểm thưởng](/diem-thuong): chọn mức [[+1]] … [[+5]] và nêu rõ lý do.",
      "Cuối tuần, vào [Dữ liệu & rà soát](/du-lieu) xử lý các mục [[Cần rà soát]] và [[Có thể trùng]].",
    ],
    sectionIds: ["nhap-lieu", "dot-kiem-tra", "diem-thuong", "du-lieu", "dien-thoai"],
  },
  {
    role: "GVCN",
    title: "Giáo viên chủ nhiệm",
    description: "Theo dõi lớp mình, nhận Báo GVCN, phản hồi và ghi biện pháp khắc phục, đề xuất điểm thưởng cho lớp.",
    steps: [
      "Sau khi đăng nhập, thẻ **Lớp của tôi** trên [Tổng quan](/) cho biết hạng, điểm thi đua, điểm trừ và điểm thưởng của lớp chủ nhiệm.",
      "Mở [Báo GVCN](/bao-gvcn) để xem báo cáo của lớp trong kỳ đang chọn (đổi kỳ ở ô **Kỳ báo cáo**).",
      "Ở từng sự việc, bấm [[Phản hồi]] để ghi phản hồi, biện pháp khắc phục và trạng thái xử lý, rồi bấm [[Gửi phản hồi]].",
      "Bấm [[Sao chép]] để dán báo cáo vào Zalo/tin nhắn, hoặc [[In / Lưu PDF]] để lưu hồ sơ.",
      "Xem [Khối & lớp](/lop) và [Học sinh](/hoc-sinh) để biết học sinh cần quan tâm; bấm tên học sinh để xem lịch sử của em.",
      "Đề xuất điểm thưởng cho lớp ở [Điểm thưởng](/diem-thuong) (trên điện thoại: [[Thêm]] → Điểm thưởng) – điểm được tính sau khi nhà trường xác nhận.",
    ],
    sectionIds: ["tong-quan", "bao-gvcn", "khoi-lop", "hoc-sinh", "diem-thuong"],
  },
  {
    role: "VIEWER",
    title: "Ban Giám hiệu",
    description: "Nắm nhanh tình hình nền nếp, so sánh các cấp, xem xếp hạng, cảnh báo sớm và báo cáo tuần/tháng.",
    steps: [
      "[Tổng quan](/) – 6 chỉ số chính so với kỳ trước, **Nhận định nhanh**, **Cảnh báo sớm** và **Top 5 lớp cần ưu tiên**.",
      "[Toàn trường](/toan-truong) – so sánh Tiểu học, THCS, THPT trên cùng một trang (với tài khoản xem nhiều cấp).",
      "[Xếp hạng](/xep-hang) – bảng thi đua theo khối (THPT: một bảng toàn cấp, nêu Top 3) với Top 90% và mức cảnh báo; xem thêm [[Biến động xếp hạng]] và [[Bao phủ kiểm tra]].",
      "[Báo cáo tuần/tháng](/bao-cao) – chọn người nhận **Ban Giám hiệu**, xem trước rồi [[In / Lưu PDF]].",
      "[Hành động](/hanh-dong) – đọc [[Bản tóm tắt quyết định]], tab [[Cảnh báo sớm]] và theo dõi hạn xử lý ở [[Quá hạn & leo thang]].",
    ],
    sectionIds: ["tong-quan", "toan-truong", "xep-hang", "bao-cao", "hanh-dong", "quy-tac-rag"],
  },
  {
    role: "ADMIN",
    title: "Quản trị",
    description: "Chuẩn bị dữ liệu đầu năm, quản lý tài khoản, cấu hình, phê duyệt ngưỡng cảnh báo và giữ dữ liệu an toàn.",
    steps: [
      "Cài đặt → [[Cấu hình thi đua]]: năm học, điểm nền, tuần đầu và học kỳ; sau đó [[Lịch tuần]] → [[Tạo lại từ cấu hình]] và tắt **Tính thi đua** cho tuần nghỉ.",
      "Kiểm tra [[Danh mục lỗi]] và [[Lớp & GVCN]] (kèm email GVCN), hoặc nhập sổ nền nếp ở [Nhập/Xuất Excel](/nhap-xuat) – luôn [[Kiểm tra trước]] rồi mới [[Xác nhận nhập]].",
      "[Quản lý học sinh](/quan-ly-hoc-sinh) → [[Import danh sách]] để cập nhật học sinh; trong năm dùng [[Thêm học sinh]], Chuyển lớp, Chuyển trường đi.",
      "Cài đặt → [[Người dùng]]: [[Thêm người dùng]] hoặc [[Tạo tài khoản GVCN hàng loạt]]; khi có người quên mật khẩu, dùng [[Đặt lại mật khẩu]].",
      "Khi BGH đã thông qua ngưỡng Vàng/Đỏ, bật [[Phê duyệt ngưỡng cảnh báo]], bấm [[Xác nhận phê duyệt]] rồi [[Lưu thay đổi]] – trước đó mọi lớp hiển thị Xám.",
      "Định kỳ: xác nhận điểm thưởng, xử lý [Dữ liệu & rà soát](/du-lieu), xem [Nhật ký](/nhat-ky) và sao lưu bằng cách [[Xuất Excel]] workbook của từng cấp học.",
    ],
    sectionIds: ["cai-dat", "nhap-xuat", "quan-ly-hoc-sinh", "du-lieu", "nhat-ky", "quy-tac-rag"],
  },
];
