/**
 * Hướng dẫn sử dụng – nhóm "Điều hành": Hành động (bản tóm tắt quyết định, cảnh báo sớm, sổ hành động, quá hạn & leo thang)
 * and Email thông báo & gửi báo cáo.
 * Labels follow src/components/actions/**, src/components/report/mail/** and constants.ts (ACTION_STATUS_LABELS,
 * PRIORITY_LABELS, MAIL_JOB_STATUS_LABELS).
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

const emailThongBao: GuideSection = {
  id: "email-thong-bao",
  title: "Email thông báo & gửi báo cáo",
  icon: "Mail",
  group: "dieuhanh",
  roles: ["ADMIN", "EDITOR", "GVCN"],
  route: "/bao-cao",
  summary: "GVCN nhận email ngay khi điểm của lớp thay đổi; Quản trị và Cán bộ nền nếp gửi báo cáo tuần/tháng qua email kèm file PDF.",
  blocks: [
    {
      kind: "p",
      text: "Phần mềm gửi email từ **hộp thư của nhà trường** (Microsoft 365). Có hai loại thư: **thông báo cho GVCN** – gửi tự động, và **báo cáo tuần/tháng** – do người dùng bấm gửi. Quản trị bật/tắt thông báo và đặt người nhận mặc định ở Cài đặt → [[Email]] của từng cấp học (xem [Cài đặt](#cai-dat)).",
    },
    {
      kind: "list",
      title: "Thông báo cho GVCN – khi nào có thư",
      items: [
        "**Trừ điểm (sự việc)**: khi Quản trị hoặc Cán bộ nền nếp ghi sự việc mới; sửa sự việc làm thay đổi điểm (ngày, lớp, lỗi, điểm trừ, học sinh, số HS chưa rõ tên, số lần, phạm vi); xóa hoặc khôi phục sự việc.",
        "**Cộng điểm (điểm thưởng)**: khi ghi điểm thưởng; khi đề xuất của GVCN được **xác nhận**; khi sửa ngày, lớp, điểm hoặc trạng thái làm khoản thưởng được tính / thôi được tính; khi xóa hoặc khôi phục.",
        "Mỗi thay đổi là **một thư riêng** gửi GVCN của lớp. Tiêu đề nêu lớp, số điểm, nội dung và ngày; thân thư có mã bản ghi (`NN-…`, `KT-…`), học sinh liên quan, người ghi, các mục đã sửa và nút [[Xem trên phần mềm]].",
        "Đổi lớp của một sự việc hay điểm thưởng: lớp cũ nhận thư “chuyển sang lớp khác”, lớp mới nhận thư ghi nhận.",
        "Người nhận: tài khoản GVCN đang hoạt động được gán lớp chủ nhiệm và **Email GVCN** của lớp ở Cài đặt → Lớp & GVCN, chỉ trong các **tên miền được phép**. Lớp chưa có email thì không có thư (nhật ký ghi **Bỏ qua**).",
      ],
    },
    {
      kind: "note",
      title: "Không gửi thông báo khi",
      text: "GVCN tự thao tác (đề xuất điểm thưởng, phản hồi, biện pháp khắc phục), nhập sổ nền nếp từ Excel, ghi đợt kiểm tra, hoặc sửa những nội dung không làm đổi điểm (chi tiết, minh chứng…).",
    },
    {
      kind: "steps",
      title: "Gửi báo cáo tuần/tháng qua email (Quản trị, Cán bộ nền nếp)",
      items: [
        "Mở [Báo cáo tuần/tháng](/bao-cao), chọn **Kỳ báo cáo** và **Người nhận** như khi in.",
        "Nếu vừa sửa **Công tác phối hợp**, bấm [[Lưu]] trước – khi còn thay đổi chưa lưu, nút gửi báo “Lưu công tác phối hợp trước khi gửi”.",
        "Bấm [[Gửi email]]. Hộp thoại có ba nhóm: **Ban Giám hiệu**, **Tổ khối** (mỗi khối một dòng) và **GVCN từng lớp** (chọn tất cả hoặc từng lớp; lớp chưa có email hiện “Chưa có email GVCN”). Người nhận đang chọn trên thanh công cụ được chọn sẵn.",
        "Bỏ chọn hoặc thêm địa chỉ nếu cần; bật/tắt [[Kèm bảng chi tiết sự việc]] và [[Gửi bản sao cho tôi]]; ghi **Lời nhắn** ngắn (tối đa 1000 ký tự).",
        "Kiểm tra dòng “Sẽ gửi … thư · … người nhận” rồi bấm [[Gửi]]. Danh sách tiến độ cho biết từng thư **Đang chờ**, **Đang gửi**, **Đã gửi** hoặc **Lỗi**; thư lỗi có nút [[Gửi lại]]. Có thể đóng hộp thoại hoặc chuyển trang – thư vẫn được gửi tiếp và phần mềm báo kết quả khi xong; mở lại [[Gửi email]] (đúng cấp học đó) để xem thư lỗi.",
      ],
    },
    {
      kind: "list",
      title: "Thư báo cáo gồm",
      items: [
        "Tiêu đề dạng “[Nền nếp] Báo cáo nền nếp … – Kính gửi: …”, lời chào và lời nhắn của người gửi.",
        "Tóm tắt: Sự việc, Lượt vi phạm, Điểm trừ, Điểm thưởng (so với kỳ trước), lớp dẫn đầu hoặc Top 3, vấn đề nổi bật, số cảnh báo sớm và công tác phối hợp.",
        "File **PDF** đính kèm đúng bản A4 trên màn hình và nút mở báo cáo trên phần mềm. File quá lớn, hoặc tạo PDF không thành công sau 2 lần thử, thì thư chỉ có liên kết và ghi rõ điều đó.",
        "GVCN chỉ nhận báo cáo của lớp mình – mỗi lớp một thư riêng.",
      ],
    },
    {
      kind: "tip",
      text: "Chỉ cần file? Bấm [[Tải PDF]] trên thanh công cụ của báo cáo để tải đúng bản A4 – dùng được cả khi chưa cấu hình email. [[In / Lưu PDF]] vẫn in trực tiếp từ trình duyệt.",
    },
    {
      kind: "warn",
      text: "Thư chỉ gửi tới địa chỉ thuộc **tên miền được phép** (mặc định: tên miền của hộp thư nhà trường) để tránh gửi nhầm dữ liệu học sinh ra ngoài; địa chỉ khác bị từ chối ngay khi bấm Gửi.",
    },
    {
      kind: "note",
      text: "Đây là thư tự động – người nhận không trả lời thư; GVCN phản hồi trực tiếp trên phần mềm (Báo GVCN → [[Phản hồi]]). Quản trị xem mọi thư đã gửi, lỗi và lý do ở Cài đặt → Email → **Nhật ký gửi thư**.",
    },
  ],
};

export const DIEUHANH_SECTIONS: GuideSection[] = [hanhDong, emailThongBao];
