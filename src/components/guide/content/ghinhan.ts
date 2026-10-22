/**
 * Hướng dẫn sử dụng – nhóm "Ghi nhận": Nhập liệu sự việc, Đợt kiểm tra, Điểm thưởng.
 * Labels follow src/components/{entry,inspections,rewards} and the engine rules (engine/scoring.ts).
 */
import type { GuideSection } from "../types";

const nhapLieu: GuideSection = {
  id: "nhap-lieu",
  title: "Nhập liệu sự việc",
  icon: "ClipboardPen",
  group: "ghinhan",
  roles: ["ADMIN", "EDITOR"],
  route: "/nhap-lieu",
  summary: "Ghi nhận sự việc nền nếp theo 7 bước, điểm trừ tự tính theo bảng điểm lỗi, kèm ảnh minh chứng; sửa trong 24 giờ.",
  blocks: [
    {
      kind: "p",
      text: "Mở [Nhập liệu](/nhap-lieu) từ menu, từ nút [[Nhập sự việc]] trên Tổng quan hoặc nút tròn vàng [[Nhập]] trên điện thoại. Trang có hai tab: [[Sự việc]] (mặc định) và [[Đợt kiểm tra]]. Mục có dấu * là bắt buộc; điểm trừ được tính tự động – không sửa tay.",
    },
    {
      kind: "steps",
      title: "Ghi nhận một sự việc (7 bước)",
      items: [
        "**Ngày & lớp** – Ngày mặc định là hôm nay (không chọn được ngày trong tương lai). Bấm **Lớp** để chọn lớp; lớp vừa dùng được gợi ý sẵn.",
        "**Lỗi vi phạm** – Gõ tên hoặc mã lỗi, không dấu cũng được (“muon”, “dong phuc”, “L01”). Khung **Thông tin lỗi** hiện Mảng, Nhóm, Mức trừ và Đơn vị theo bảng điểm lỗi.",
        "**Phạm vi** – [[Cá nhân]] (vi phạm của từng học sinh) hoặc [[Tập thể]] (vi phạm của nhiều học sinh/tập thể lớp). Phần mềm chọn sẵn theo đơn vị lỗi; thầy/cô có thể đổi.",
        "**Học sinh liên quan** – Chỉ hiện học sinh đang học của lớp đã chọn; tìm theo tên hoặc Mã HS, hoặc chọn ở mục **Hay gặp gần đây**. Với lỗi tính theo lần sẽ có thêm ô **Số lần vi phạm**; với lỗi /HS + Tập thể có thêm ô **Số HS chưa rõ tên**.",
        "**Điểm trừ** – Ô **Điểm trừ dự kiến** hiện kết quả và cách tính, ví dụ “2 điểm × 3 HS = 6”. Nếu còn thiếu gì, ô này liệt kê lý do chưa lưu được.",
        "**Chi tiết** (không bắt buộc) – **Mô tả sự việc** giúp GVCN và BGH nắm rõ (ví dụ: “7h20 tại cổng trường, đến sau hồi trống”); **Người ghi** (để trống: dùng tên tài khoản); **Trạng thái** (mặc định Mới ghi nhận).",
        "**Minh chứng** (không bắt buộc) – [[Chụp ảnh]] hoặc [[Chọn ảnh]] (tối đa 5 ảnh), hoặc [[Thêm liên kết]] (tối đa 5 liên kết).",
      ],
    },
    {
      kind: "p",
      text: "Cuối cùng bấm [[Lưu]] (form trở về trống cho sự việc mới, ngày về hôm nay; lớp vừa dùng và người ghi được giữ sẵn) hoặc [[Lưu & nhập tiếp]] (giữ nguyên ngày, lớp, phạm vi và người ghi để ghi tiếp cùng lớp). Trên máy tính có thể nhấn **Ctrl + Enter** để lưu. Sau khi lưu, phần mềm báo “Đã ghi nhận NN-… · n điểm trừ”.",
    },
    {
      kind: "table",
      caption: "Lỗi tính theo học sinh (/HS) và theo lần (/lần)",
      head: ["", "/HS – theo số học sinh", "/lần – theo số lần"],
      rows: [
        ["Cách tính", "Mức trừ × số học sinh liên quan (có tên + chưa rõ tên)", "Mức trừ × số lần vi phạm (mặc định 1 lần)"],
        ["Chọn học sinh", "Bắt buộc ít nhất 1 học sinh (chọn tên hoặc nhập số HS chưa rõ tên)", "Không bắt buộc với Tập thể – chỉ để tham chiếu, không cộng thêm điểm"],
        ["Ví dụ", "Lỗi 2 điểm/HS, 3 học sinh → 6 điểm trừ", "Lỗi 5 điểm/lần, 2 lần → 10 điểm trừ"],
      ],
    },
    { kind: "demo", demo: "formula", caption: "Ô Điểm trừ dự kiến tính lại ngay khi thầy/cô chọn lỗi, học sinh hoặc số lần." },
    {
      kind: "table",
      caption: "Cá nhân và Tập thể",
      head: ["Phạm vi", "Khi nào dùng", "Quy tắc"],
      rows: [
        ["Cá nhân", "Vi phạm của từng học sinh cụ thể.", "Bắt buộc chọn tên học sinh liên quan."],
        ["Tập thể", "Vi phạm của nhiều học sinh trong lớp hoặc của tập thể lớp.", "Lỗi /HS: chọn tên hoặc nhập **Số HS chưa rõ tên**. Lỗi /lần: không bắt buộc chọn học sinh."],
      ],
    },
    {
      kind: "warn",
      title: "Số HS chưa rõ tên",
      text: "Chỉ dùng khi chưa xác định được tên. Sự việc vẫn được tính điểm nhưng mang nhãn **Thiếu tên HS** để rà soát; khi biết tên, bổ sung ở [Dữ liệu & rà soát](/du-lieu?tab=ra-soat).",
    },
    {
      kind: "p",
      text: "**Cảnh báo có thể trùng.** Khi đã có sự việc cùng ngày, cùng lớp, cùng lỗi và có chung học sinh (hoặc cả hai đều không ghi tên học sinh nào), form hiện dòng “Có thể trùng với NN-…” (kèm người ghi, giờ ghi). Bấm lưu sẽ mở hộp **Có thể trùng sự việc đã ghi** – bấm [[Xem]] để xem lại sự việc đã có. Nếu đây là sự việc khác, chọn [[Không trùng, vẫn lưu]]; nếu là cùng một sự việc (ví dụ hai thầy cô cùng ghi), chọn [[Hủy]] để điểm trừ không bị tính hai lần.",
    },
    {
      kind: "steps",
      title: "Sửa sự việc đã ghi (trong 24 giờ)",
      items: [
        "Ở khung **Ghi nhận gần đây** (màn hình rộng: bên phải form; màn hình nhỏ: phía dưới form), tìm sự việc vừa ghi và bấm [[Sửa]]. Cũng có thể mở chi tiết sự việc rồi bấm [[Sửa]].",
        "Form chuyển sang **Sửa sự việc NN-…** và cho biết thời gian còn lại để sửa.",
        "Chỉnh thông tin rồi bấm [[Cập nhật]] – điểm trừ được tính lại theo quy định. Bấm [[Hủy sửa]] để bỏ.",
      ],
    },
    {
      kind: "note",
      title: "Quyền sửa và xóa",
      text: "Cán bộ nền nếp chỉ sửa được sự việc **do chính mình ghi**, trong **24 giờ** kể từ khi ghi. Quá thời hạn hoặc cần xóa, hãy liên hệ Quản trị: Quản trị sửa được mọi sự việc và xóa kèm lý do (xóa mềm – khôi phục được).",
    },
    {
      kind: "tip",
      title: "Không lo mất dữ liệu đang nhập",
      text: "Nếu bấm sang trang khác hoặc đổi cấp học khi chưa lưu, phần mềm hỏi “Bỏ sự việc đang nhập?” – chọn [[Ở lại]] để tiếp tục (chọn [[Bỏ và rời trang]] thì phần đang nhập bị bỏ). Nếu lỡ rời trang mà không có câu hỏi này (ví dụ vuốt hoặc bấm nút quay lại của trình duyệt), thông tin đang nhập vẫn được giữ trong thẻ trình duyệt đó và tự khôi phục khi mở lại form (“Đã khôi phục sự việc đang nhập dở”). Tải lại trang hoặc đóng thẻ thì không giữ được – trình duyệt sẽ hỏi trước.",
    },
    {
      kind: "note",
      text: "Không lưu được? Thanh lưu ở cuối màn hình ghi “Chưa thể lưu: …” – chạm vào để cuộn tới chỗ cần sửa. Ngày ghi nhận phải nằm trong lịch tuần của năm học; lớp và lỗi phải còn đang sử dụng; học sinh phải đang học ở lớp đã chọn.",
    },
  ],
};

const dotKiemTra: GuideSection = {
  id: "dot-kiem-tra",
  title: "Đợt kiểm tra",
  icon: "CalendarCheck",
  group: "ghinhan",
  roles: ["ADMIN", "EDITOR"],
  route: "/nhap-lieu",
  summary: "Ghi lại lớp nào được kiểm tra, khi nào, mảng nào – để đánh giá độ bao phủ và so sánh điểm trừ công bằng.",
  blocks: [
    {
      kind: "p",
      text: "Một lớp được kiểm tra nhiều lần dễ bị ghi nhiều lỗi hơn lớp ít được kiểm tra. **Đợt kiểm tra** ghi lại các lớp đã được kiểm tra trong mỗi buổi, để trang Xếp hạng → [[Bao phủ kiểm tra]] chỉ ra lớp nào ít được kiểm tra. Đợt kiểm tra **không cộng hay trừ điểm**.",
    },
    {
      kind: "steps",
      title: "Ghi một đợt kiểm tra",
      items: [
        "Mở [Nhập liệu → Đợt kiểm tra](/nhap-lieu?tab=kiem-tra) (tab [[Đợt kiểm tra]]).",
        "Chọn **Ngày kiểm tra** (mặc định hôm nay) và **Buổi**: [[Sáng]], [[Chiều]] hoặc [[Không ghi]].",
        "Chọn **Mảng kiểm tra**: “Kiểm tra chung (mọi mảng)” hoặc một mảng cụ thể.",
        "Ở **Lớp được kiểm tra**, chạm vào từng lớp; dùng **Chọn cả khối**, [[Chọn tất cả]] hoặc [[Bỏ chọn]] cho nhanh.",
        "**Người kiểm tra** để trống sẽ dùng tên tài khoản; **Ghi chú** không bắt buộc (ví dụ: kiểm tra đột xuất giờ truy bài).",
        "Bấm [[Lưu đợt kiểm tra]]. Phần mềm tạo mã đợt dạng `DKT-yyyymmdd-NNN`.",
      ],
    },
    {
      kind: "list",
      title: "Sửa hoặc xóa đợt kiểm tra",
      items: [
        "Danh sách **Đợt kiểm tra gần đây** (30 ngày) hiện mã, ngày, buổi, mảng, số lớp và người kiểm tra.",
        "Người ghi sửa/xóa được trong 24 giờ; Quản trị sửa/xóa được mọi đợt. Bấm biểu tượng sửa → chỉnh → [[Lưu thay đổi]].",
        "Xóa cần nhập **Lý do xóa** (tối thiểu 3 ký tự, được lưu vào nhật ký). Đợt đã xóa không còn tính vào độ bao phủ và không khôi phục được – hãy kiểm tra kỹ trước khi xóa.",
      ],
    },
    {
      kind: "tip",
      text: "Ghi đợt kiểm tra ngay sau mỗi buổi đi kiểm tra – kể cả khi không phát hiện lỗi nào. Lớp không có lỗi nhưng đã được kiểm tra cũng cần được ghi nhận.",
    },
  ],
};

const diemThuong: GuideSection = {
  id: "diem-thuong",
  title: "Điểm thưởng",
  icon: "Award",
  group: "ghinhan",
  roles: ["ADMIN", "EDITOR", "GVCN"],
  route: "/diem-thuong",
  summary: "Ghi điểm thưởng tập thể lớp (+1 đến +5, lý do bắt buộc), xác minh – xác nhận, và GVCN đề xuất điểm thưởng cho lớp mình.",
  blocks: [
    {
      kind: "p",
      text: "Điểm thưởng dành cho **tập thể lớp**. Mỗi khoản có mã thưởng tạo tự động (dạng `KT-…`) và chỉ được cộng vào điểm thi đua khi ở **trạng thái được tính** (mặc định: Đã xác nhận). Riêng đề xuất của GVCN chỉ được cộng khi ở trạng thái **Đã xác nhận**, kể cả khi cấp học cấu hình tính thêm trạng thái khác.",
    },
    {
      kind: "steps",
      title: "Ghi điểm thưởng (Cán bộ nền nếp, Quản trị)",
      items: [
        "Mở [Điểm thưởng](/diem-thuong) từ menu (trên máy tính, trang Nhập liệu cũng có nút [[Ghi điểm thưởng]]).",
        "Chọn **Ngày** và **Lớp**.",
        "Chọn **Mức điểm cộng**: một trong 5 nút [[+1]] … [[+5]] – phần mềm không chọn sẵn, thầy/cô phải chọn.",
        "Nhập **Lý do cộng điểm** (bắt buộc, tối thiểu 5 ký tự), ví dụ “Đạt giải Nhì hội thi văn nghệ chào mừng 20/11”. Có thể bấm các gợi ý nhanh như “Đạt giải phong trào”, “Lớp sạch đẹp tiêu biểu”.",
        "Chọn **Trạng thái**, thêm **Người ghi**, **Ghi chú thêm** và minh chứng nếu có.",
        "Bấm [[Lưu điểm thưởng]].",
      ],
    },
    { kind: "demo", demo: "reward-levels", caption: "Năm mức điểm cộng từ +1 đến +5." },
    {
      kind: "table",
      caption: "Trạng thái điểm thưởng",
      head: ["Trạng thái", "Ý nghĩa", "Ai đặt"],
      rows: [
        ["Mới ghi nhận", "Vừa ghi, chưa kiểm tra minh chứng.", "Cán bộ nền nếp, Quản trị; mọi đề xuất của GVCN"],
        ["Đang xác minh", "Đang kiểm tra minh chứng.", "Cán bộ nền nếp, Quản trị"],
        ["Đã xác nhận", "Đã kiểm tra – được cộng vào điểm thi đua (mặc định).", "Chỉ Quản trị"],
      ],
    },
    {
      kind: "p",
      text: "Danh sách **Điểm thưởng trong kỳ** theo bộ lọc kỳ/khối/lớp, đầu danh sách ghi tổng **Đã xác nhận: n điểm** và **Chờ xác minh: n**. Cột **Được tính?** cho biết khoản đó đã cộng vào điểm thi đua hay chưa. Quản trị xác minh nhanh ngay trên dòng bằng [[Chuyển Đang xác minh]] và [[Xác nhận]].",
    },
    {
      kind: "steps",
      title: "GVCN đề xuất điểm thưởng cho lớp mình",
      items: [
        "Mở [Điểm thưởng](/diem-thuong) (trên điện thoại: [[Thêm]] → Điểm thưởng).",
        "Form **Đề xuất điểm thưởng** chỉ cho chọn lớp chủ nhiệm.",
        "Chọn mức [[+1]] … [[+5]] và nhập lý do (tối thiểu 5 ký tự), thêm minh chứng nếu có.",
        "Bấm [[Gửi đề xuất]]. Đề xuất mang nhãn **GVCN đề xuất**, ở trạng thái Mới ghi nhận và chỉ được tính sau khi Quản trị chuyển sang **Đã xác nhận**.",
      ],
    },
    {
      kind: "note",
      text: "Quản trị và cán bộ nền nếp lọc nhanh các đề xuất bằng nút [[Đề xuất của GVCN]] phía trên danh sách (nút chỉ hiện khi kỳ đang xem có đề xuất). GVCN không sửa hay xóa được đề xuất đã gửi – nếu cần điều chỉnh, liên hệ cán bộ nền nếp hoặc Quản trị.",
    },
    {
      kind: "list",
      title: "Sửa, xóa và điểm cũ",
      items: [
        "Cán bộ nền nếp sửa được điểm thưởng do mình ghi trong 24 giờ (khi chưa Đã xác nhận); Quản trị sửa được mọi khoản.",
        "Chỉ Quản trị xóa điểm thưởng (kèm lý do); khoản đã xóa khôi phục được ở Dữ liệu & rà soát → [[Đã xóa]].",
        "Khoản thưởng cũ có mức ngoài thang 1–5 (ví dụ “+10 (mức cũ)”) vẫn giữ nguyên nếu không đổi mức điểm.",
      ],
    },
  ],
};

export const GHINHAN_SECTIONS: GuideSection[] = [nhapLieu, dotKiemTra, diemThuong];
