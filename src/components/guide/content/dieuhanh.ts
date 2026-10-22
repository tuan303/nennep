/**
 * Hướng dẫn sử dụng – nhóm "Điều hành": Hành động (bản tóm tắt quyết định, cảnh báo sớm, sổ hành động, quá hạn & leo thang).
 * Labels follow src/components/actions/** and constants.ts (ACTION_STATUS_LABELS, PRIORITY_LABELS).
 */
import type { GuideSection } from "../types";

const hanhDong: GuideSection = {
  id: "hanh-dong",
  title: "Hành động và cảnh báo sớm",
  icon: "ListChecks",
  group: "dieuhanh",
  roles: ["ADMIN", "EDITOR", "VIEWER"],
  route: "/hanh-dong",
  summary: "Bản tóm tắt quyết định, cảnh báo sớm, sổ hành động cải thiện nền nếp và theo dõi quá hạn – leo thang.",
  blocks: [
    {
      kind: "p",
      text: "Trang [Hành động](/hanh-dong) giúp Ban Giám hiệu và Quản trị biến số liệu thành việc cần làm. Trang có 4 tab: [[Bản tóm tắt quyết định]], [[Cảnh báo sớm]], [[Sổ hành động]] và [[Quá hạn & leo thang]] (trên điện thoại: Tóm tắt · Cảnh báo sớm · Sổ hành động · Quá hạn). Kỳ của tab tóm tắt và cảnh báo dùng chung với các màn hình thống kê.",
    },
    {
      kind: "note",
      text: "Cán bộ nền nếp và Người xem thấy nhãn **Chỉ xem** ở đầu trang: tài khoản chỉ được xem, việc tạo và cập nhật hành động do Quản trị thực hiện.",
    },
    {
      kind: "list",
      title: "Bản tóm tắt quyết định",
      items: [
        "Được sinh tự động từ dữ liệu của kỳ: **Tóm tắt**, **Phát hiện chính**, **Bằng chứng**, **Tác động** và **Đề xuất hành động** (mức ưu tiên, người phụ trách, hạn xử lý đề xuất = hôm nay + thời hạn của mức ưu tiên).",
        "Bấm [[Sao chép]] để dán vào Zalo, email hoặc văn bản; [[In]] để in.",
        "Quản trị bấm [[Tạo hành động]] cạnh một đề xuất để đưa vào sổ hành động (nội dung được điền sẵn).",
        "Bản tóm tắt chỉ là gợi ý từ dữ liệu – quyết định thuộc người có thẩm quyền.",
      ],
    },
    {
      kind: "list",
      title: "Cảnh báo sớm",
      items: [
        "Gom 4 loại cảnh báo: **Tái phạm** (học sinh), **Tăng lỗi** (lớp có điểm trừ tuần tăng mạnh), **Lỗi kéo dài** (lớp mắc cùng một lỗi nhiều tuần liên tiếp), **Sự việc nghiêm trọng** (chưa đóng, thuộc nhóm lỗi được đặt là nghiêm trọng – mặc định Nhóm 3, Nhóm 4 – hoặc có mức trừ từ ngưỡng Quản trị đặt).",
        "Cảnh báo được xếp theo mức: **Mức cao – cần xử lý ngay**, **Mức trung bình – cần theo dõi**. Bấm các nút loại cảnh báo phía trên để lọc.",
        "Mỗi cảnh báo có liên kết tới lớp, phần **Bằng chứng** (mã sự việc, [[Lịch sử học sinh]]) và – với Quản trị – nút [[Tạo hành động]] điền sẵn nội dung, mức ưu tiên, người phụ trách và hạn xử lý.",
        "Cảnh báo áp dụng các bộ lọc khối, lớp, mảng, nhóm lỗi, lỗi, học sinh đang chọn ở các trang thống kê; bấm [[Bỏ lọc]] để xem toàn cấp. Cách tính và ngưỡng: xem [Cảnh báo học sinh và cảnh báo sớm](#quy-tac-canh-bao).",
      ],
    },
    {
      kind: "list",
      title: "Sổ hành động",
      items: [
        "Các ô đếm: **Mới mở**, **Đang thực hiện**, **Hoàn thành**, **Quá hạn**.",
        "Tìm theo nội dung, người phụ trách, lớp, mã; lọc theo **Mức ưu tiên** (Cao, Trung bình, Thấp).",
        "Xem dạng [[Kanban]] (ba cột theo trạng thái) hoặc [[Bảng]]. Bấm một hành động để mở **Chi tiết hành động**.",
      ],
    },
    {
      kind: "steps",
      title: "Tạo hành động (Quản trị)",
      items: [
        "Bấm [[Tạo hành động]] ở đầu trang (hoặc từ một đề xuất/cảnh báo).",
        "Nhập **Nội dung hành động**, ví dụ “Lập kế hoạch khắc phục nền nếp lớp 6A01, tập trung lỗi đi học muộn”, và **Mô tả** nếu cần.",
        "Chọn **Mức ưu tiên**, nhập **Người phụ trách** (họ tên hoặc vai trò) và **Hạn xử lý** – phần mềm gợi ý theo thời hạn của mức ưu tiên (mặc định Cao 3 ngày, Trung bình 7 ngày, Thấp 14 ngày).",
        "Chọn **Lớp liên quan** (bỏ trống nếu áp dụng toàn cấp học; không đổi được sau khi tạo) và **Tuần phát sinh** (không bắt buộc), rồi bấm [[Tạo hành động]] ở cuối hộp thoại. Mã hành động có dạng `HD-…`.",
      ],
    },
    {
      kind: "steps",
      title: "Cập nhật tiến độ",
      items: [
        "Mở hành động trong sổ → bấm [[Bắt đầu thực hiện]] khi bắt đầu.",
        "Ghi **Ghi chú cập nhật** sau mỗi bước (được lưu vào mục **Lịch sử**), bấm [[Lưu thay đổi]].",
        "Khi xong, nhập **Minh chứng hoàn tất** (biên bản, kết quả kiểm tra, đường dẫn ảnh…) rồi bấm [[Hoàn thành]].",
        "Cần làm lại thì bấm [[Mở lại]].",
      ],
    },
    {
      kind: "warn",
      text: "Không chuyển được sang **Hoàn thành** khi ô **Minh chứng hoàn tất** còn trống – phần mềm sẽ nhắc “Nhập minh chứng vào ô “Minh chứng hoàn tất” rồi bấm Hoàn thành.”",
    },
    {
      kind: "list",
      title: "Quá hạn & leo thang",
      items: [
        "**Hành động quá hạn**: chưa hoàn thành và đã qua hạn xử lý.",
        "**Cần leo thang**: quá hạn lâu hơn thời hạn của mức ưu tiên – đề nghị báo cáo BGH và thống nhất lại hạn hoặc người phụ trách.",
        "**Sắp đến hạn (≤ 2 ngày)**: nhắc trước để kịp xử lý.",
        "Bấm [[Sao chép danh sách cần leo thang]] để gửi nhanh cho BGH.",
      ],
    },
  ],
};

export const DIEUHANH_SECTIONS: GuideSection[] = [hanhDong];
