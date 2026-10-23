/**
 * Hướng dẫn sử dụng – nhóm "Xem & theo dõi": Tổng quan, Toàn trường, Xếp hạng, Khối & lớp, Báo GVCN, Học sinh,
 * Báo cáo tuần/tháng. Labels follow src/components/{dashboard,ranking,class-detail,gvcn-report,students-view,report}.
 */
import type { GuideSection } from "../types";

const tongQuan: GuideSection = {
  id: "tong-quan",
  title: "Tổng quan",
  icon: "LayoutDashboard",
  group: "xem",
  roles: "all",
  route: "/",
  summary: "Bức tranh nền nếp của cấp học trong kỳ đang chọn: chỉ số chính, xu hướng, cảnh báo và lớp cần ưu tiên.",
  blocks: [
    {
      kind: "p",
      text: "[Tổng quan](/) là trang mở ra đầu tiên sau khi đăng nhập. Đầu trang ghi cấp học, năm học, kỳ đang xem và thời điểm cập nhật; bên phải có [[In]], [[Xem xếp hạng]] và – với người được nhập – nút [[Nhập sự việc]].",
    },
    {
      kind: "p",
      text: "Hàng **Chỉ số chính** gồm 6 ô: **Sự việc**, **Lượt vi phạm**, **Số HS vi phạm**, **Điểm trừ**, **Điểm thưởng** và **Độ tin cậy dữ liệu**. Mỗi ô so sánh với kỳ trước (ví dụ “so với tuần trước”) và có đường xu hướng nhỏ; biểu tượng ⓘ giải thích cách đếm. Xem thêm [Sự việc, lượt vi phạm và số học sinh](#quy-tac-so-lieu).",
    },
    { kind: "demo", demo: "kpi", caption: "Ô chỉ số với so sánh kỳ trước (dữ liệu minh họa)." },
    {
      kind: "table",
      caption: "Các thẻ trên trang Tổng quan",
      head: ["Thẻ", "Cho biết gì – bấm vào để làm gì"],
      rows: [
        ["Lớp của tôi", "Chỉ hiện với GVCN: hạng, điểm thi đua, điểm trừ, điểm thưởng của lớp chủ nhiệm. Bấm để mở chi tiết lớp."],
        ["Nhận định nhanh", "Tóm tắt tự động: Cần xử lý ngay, Cần chú ý, Ghi nhận."],
        ["Cảnh báo sớm", "Số cảnh báo theo 4 loại (Tái phạm, Tăng lỗi, Lỗi kéo dài, Sự việc nghiêm trọng) và các cảnh báo đầu tiên; bấm một cảnh báo để mở sự việc, học sinh hoặc lớp liên quan. Tài khoản mở được trang Hành động có thêm nút [[Xem tất cả]] dẫn tới [Hành động → Cảnh báo sớm](/hanh-dong?tab=canh-bao)."],
        ["Xu hướng theo tuần", "Sự việc hoặc điểm trừ/điểm thưởng từng tuần từ đầu năm học. Bấm vào một tuần để lọc cả trang theo tuần đó."],
        ["Tình trạng lớp (RAG)", "Số lớp Xanh / Vàng / Đỏ / Xám và danh sách lớp cần chú ý."],
        ["Theo nhóm lỗi", "Biểu đồ cột theo nhóm lỗi (Sự việc, Lượt vi phạm hoặc Điểm trừ). Bấm một cột để lọc theo nhóm, bấm lại để bỏ."],
        ["Điểm trừ cộng dồn", "Điểm trừ tích lũy từ đầu năm học: Toàn cấp, Theo khối hoặc Theo lớp."],
        ["Top 5 vấn đề", "Các lỗi phát sinh nhiều nhất trong kỳ; bấm để lọc theo lỗi."],
        ["Top 5 lớp cần ưu tiên", "Lớp nhiều điểm trừ nhất; bấm để xem chi tiết lớp."],
        ["Học sinh vi phạm nhiều", "Học sinh được ghi tên nhiều lần; bấm để xem lịch sử của em."],
        ["Theo khối", "Số liệu từng khối; bấm một khối để lọc cả trang."],
        ["Phân bổ theo mảng · Ngày trong tuần", "Mảng nào, ngày nào trong tuần phát sinh nhiều sự việc."],
        ["Bản đồ nhiệt lớp × tuần", "Điểm trừ của mỗi lớp theo tuần; bấm một ô để lọc theo lớp và tuần đó."],
        ["Theo dõi 5S · Tái phạm", "Lỗi gắn nhãn 5S; lớp có điểm trừ tuần từ ngưỡng Vàng trở lên nhiều tuần liên tiếp và học sinh cần theo dõi."],
      ],
    },
    {
      kind: "warn",
      title: "Thấy dòng “Ngưỡng cảnh báo RAG chưa được phê duyệt”?",
      text: "Khi ngưỡng Vàng/Đỏ chưa được phê duyệt, mọi lớp hiển thị **Xám**. Quản trị vào Cài đặt → Cấu hình thi đua để phê duyệt sau khi BGH thông qua (xem [Cài đặt](#cai-dat)).",
    },
    {
      kind: "tip",
      text: "Muốn in Tổng quan để họp? Chọn kỳ cần in ở bộ lọc rồi bấm [[In]] – phần menu và nút bấm được ẩn khi in.",
    },
  ],
};

const toanTruong: GuideSection = {
  id: "toan-truong",
  title: "Toàn trường",
  icon: "School",
  group: "xem",
  roles: "all",
  route: "/toan-truong",
  summary: "So sánh nền nếp giữa Tiểu học, THCS và THPT – dành cho tài khoản xem từ hai cấp trở lên.",
  blocks: [
    {
      kind: "p",
      text: "Trang [Toàn trường](/toan-truong) chỉ hiện với tài khoản được xem **từ hai cấp học trở lên**. Mỗi cấp dùng lịch tuần riêng, nên ô **Kỳ so sánh** (Tuần hiện tại, Tháng hiện tại, Học kỳ hiện tại, Toàn bộ năm học) được xác định theo từng cấp.",
    },
    {
      kind: "list",
      title: "Trang gồm",
      items: [
        "**Chỉ số toàn trường**: Sự việc, Điểm trừ, Điểm thưởng, **Lớp mức Đỏ**, **HS cần theo dõi** (cảnh báo đỏ hoặc tái phạm) và **Độ tin cậy dữ liệu** của các cấp gộp lại.",
        "Thẻ từng cấp học với **Dẫn đầu** và **Cần chú ý**; bấm thẻ để mở Tổng quan của cấp đó.",
        "**So sánh giữa các cấp** đã quy đổi để so được với nhau: Sự việc/100 HS, Điểm trừ/lớp, Thưởng/lớp.",
        "**Tỷ lệ lớp theo trạng thái RAG**, **Xu hướng điểm trừ theo tuần** (TB mỗi lớp hoặc Tổng điểm).",
        "**Top 5 vấn đề toàn trường** và **Cảnh báo theo cấp học**.",
      ],
    },
    {
      kind: "tip",
      text: "Khi so sánh các cấp, ưu tiên các chỉ số đã quy đổi (trên 100 học sinh, trên mỗi lớp) vì số lớp và sĩ số mỗi cấp khác nhau.",
    },
  ],
};

const xepHang: GuideSection = {
  id: "xep-hang",
  title: "Xếp hạng thi đua",
  icon: "Trophy",
  group: "xem",
  roles: "all",
  route: "/xep-hang",
  summary: "Bảng xếp hạng theo khối (THPT: một bảng toàn cấp), Top 90%, mức cảnh báo RAG, biến động xếp hạng qua các tuần và bao phủ kiểm tra.",
  blocks: [
    {
      kind: "p",
      text: "Trang [Xếp hạng](/xep-hang) có 3 chế độ xem: [[Bảng xếp hạng]], [[Biến động xếp hạng]] và [[Bao phủ kiểm tra]] (trên điện thoại: Bảng · Biến động · Bao phủ). Kỳ xếp hạng theo bộ lọc kỳ; bấm các nút **Khối …** phía trên bảng để nhảy nhanh tới khối cần xem. Cấp THPT chỉ có **một bảng Toàn cấp** gồm mọi lớp khối 10, 11, 12, đầu bảng nêu **Top 3 toàn cấp**.",
    },
    {
      kind: "p",
      text: "Dải giải thích đầu trang cho biết số **tuần tính điểm** và **Điểm nền** của kỳ (ví dụ 100 × 4 tuần = 400). Trên điện thoại bấm [[Cách tính]] để xem công thức, cách xếp hạng (trong khối hoặc toàn cấp), quy tắc Top và các mức cảnh báo đang áp dụng.",
    },
    {
      kind: "table",
      caption: "Các cột của Bảng xếp hạng",
      head: ["Cột", "Ý nghĩa"],
      rows: [
        ["Hạng", "Thứ hạng trong khối – THPT: thứ hạng toàn cấp (hạng 1, 2, 3 có huy chương vàng, bạc, đồng). Khi bật công tắc **So sánh tuần trước** (tháng trước, học kỳ trước – tùy kỳ đang xem), cạnh hạng có mũi tên tăng/giảm bao nhiêu bậc."],
        ["Lớp", "Mã lớp và GVCN."],
        ["Điểm nền · Thưởng · Trừ", "Ba thành phần của điểm thi đua."],
        ["Điểm thi đua", "Điểm nền + Thưởng − Trừ."],
        ["Lượt vi phạm", "Chỉ có ở THPT: các lớp bằng điểm thì lớp ít lượt vi phạm hơn xếp trên; bằng cả hai thì đồng hạng."],
        ["Đánh giá", "Nhãn Top 90% / Ngoài Top 90% và mức cảnh báo RAG (màn hình rất rộng tách thành hai cột Top 90% và Mức cảnh báo)."],
        ["Xu hướng", "Điểm thi đua các tuần gần nhất của lớp."],
        ["Mũi tên cuối dòng", "Mở phần phân tích lớp ngay dưới dòng (trên điện thoại: chạm vào thẻ lớp để mở **Phân tích lớp**): sự việc, HS liên quan, điểm trừ TB/tuần, độ tin cậy dữ liệu, điểm trừ theo lỗi và điểm thưởng."],
      ],
    },
    { kind: "demo", demo: "top90", caption: "Nhãn Top 90% và Ngoài Top 90%." },
    { kind: "demo", demo: "rag", caption: "Bốn mức cảnh báo RAG – luôn có biểu tượng và chữ đi kèm màu." },
    {
      kind: "note",
      title: "Bộ lọc trên trang Xếp hạng",
      text: "Lọc **lớp** chỉ làm nổi bật lớp đó – thứ hạng vẫn tính trên toàn bộ lớp của khối (THPT: của cả cấp). Ở THPT, lọc **khối** không thu hẹp bảng xếp hạng vì thứ hạng tính chung toàn cấp. Lọc **mảng, nhóm lỗi, lỗi, học sinh** không áp dụng cho xếp hạng: điểm thi đua luôn tính mọi lỗi.",
    },
    {
      kind: "list",
      title: "Biến động xếp hạng",
      items: [
        "Mỗi khối một biểu đồ thứ hạng qua các tuần tính thi đua (THPT: một biểu đồ toàn cấp): 5 lớp đứng đầu tuần cuối và lớp đang lọc được tô đậm; bật [[Hiện các lớp khác]] để xem tất cả.",
        "[[Cộng dồn]]: hạng theo điểm thi đua cộng dồn từ đầu kỳ đến từng tuần (tuần cuối = bảng xếp hạng của kỳ). [[Từng tuần]]: hạng theo điểm của riêng từng tuần.",
        "Bên dưới có danh sách **Tăng hạng nhiều nhất** và **Giảm hạng nhiều nhất**.",
      ],
    },
    {
      kind: "list",
      title: "Bao phủ kiểm tra",
      items: [
        "Cho biết mỗi lớp được kiểm tra bao nhiêu **đợt** và bao nhiêu **buổi** (ngày + sáng/chiều) trong kỳ, so với trung bình của khối – để so sánh điểm trừ được công bằng.",
        "Các ô chỉ số: Đợt kiểm tra, Số buổi, Lớp được kiểm tra, Lớp chưa công bằng.",
        "Cột **Trạng thái**: **Đạt**, **Ít được kiểm tra** (dưới 60% trung bình đợt của khối) hoặc **Chưa được kiểm tra**.",
        "Số liệu lấy từ các [đợt kiểm tra](/nhap-lieu?tab=kiem-tra) do cán bộ nền nếp ghi nhận.",
      ],
    },
    {
      kind: "p",
      text: "Bấm [[In]] để in chế độ đang xem. Quản trị có thêm [[Xuất Excel]] ở chế độ Bảng xếp hạng.",
    },
  ],
};

const khoiLop: GuideSection = {
  id: "khoi-lop",
  title: "Khối & lớp",
  icon: "Layers",
  group: "xem",
  roles: "all",
  route: "/lop",
  summary: "Chi tiết từng lớp: chỉ số, thứ hạng (trong khối; THPT: toàn cấp), điểm thi đua theo tuần, điểm trừ cộng dồn và dòng thời gian sự việc.",
  blocks: [
    {
      kind: "p",
      text: "Khi chưa chọn lớp, trang [Khối & lớp](/lop) liệt kê các lớp theo khối, sắp theo hạng thi đua (THPT: một nhóm Toàn cấp, sắp theo hạng toàn cấp). Bấm một lớp hoặc dùng ô chọn lớp (gõ mã lớp hoặc tên GVCN). GVCN thấy dòng **Lớp chủ nhiệm:** với nút vàng mang mã lớp của mình để mở nhanh.",
    },
    {
      kind: "list",
      title: "Chi tiết một lớp",
      items: [
        "**Thông tin lớp**: GVCN, phó chủ nhiệm, sĩ số; nút gọi điện hoặc gửi thư cho GVCN khi có thông tin liên hệ.",
        "**Chỉ số** của lớp trong kỳ: Sự việc, Lượt vi phạm, Số HS vi phạm, Điểm trừ, Điểm thưởng, **Điểm thi đua** (kèm Hạng X/N trong khối – THPT: toàn cấp) và Độ tin cậy dữ liệu.",
        "**Điểm thi đua theo tuần** từ đầu năm học và **Điểm trừ cộng dồn** của lớp so với trung bình khối.",
        "**Phân bổ theo mảng** và **Lỗi thường gặp** của lớp.",
        "**Học sinh có vi phạm trong lớp** – bấm tên để xem lịch sử của em.",
        "**Dòng thời gian sự việc** theo ngày (mới nhất trước): ngày → lỗi → điểm → học sinh → chi tiết; bấm một sự việc để xem đầy đủ, kể cả minh chứng.",
      ],
    },
    {
      kind: "p",
      text: "Nút [[Bảng xếp hạng]] mở khối của lớp trên trang Xếp hạng (THPT: bảng toàn cấp); [[In]] để in trang chi tiết lớp.",
    },
    {
      kind: "note",
      text: "Nếu lớp không thuộc khối đang lọc, trang sẽ gợi ý bỏ lọc khối. Nếu mã lớp thuộc cấp khác, hãy đổi cấp học ở thanh trên cùng.",
    },
  ],
};

const baoGvcn: GuideSection = {
  id: "bao-gvcn",
  title: "Báo GVCN",
  icon: "ClipboardList",
  group: "xem",
  roles: "all",
  route: "/bao-gvcn",
  summary: "Báo cáo nền nếp theo lớp gửi GVCN: sao chép gửi Zalo, in/lưu PDF, phản hồi và biện pháp khắc phục.",
  blocks: [
    {
      kind: "p",
      text: "[Báo GVCN](/bao-gvcn) lập báo cáo của **một lớp** trong kỳ đang chọn: sự việc, điểm thưởng, điểm thi đua, xếp hạng và học sinh cần quan tâm. Chọn **Lớp** (GVCN: **Lớp chủ nhiệm**) và **Kỳ báo cáo** ở thanh phía trên báo cáo.",
    },
    {
      kind: "list",
      title: "Nội dung báo cáo",
      items: [
        "Thông tin lớp (GVCN, Phó CN, Khối, Sĩ số) và các chỉ số: Sự việc, Lượt vi phạm, Số HS vi phạm, Điểm trừ, Điểm thưởng, **Điểm thi đua** và **Hạng khối** – THPT: **Hạng toàn cấp** (kèm ngưỡng Top).",
        "**Học sinh cần quan tâm** – học sinh có tên trong sự việc của lớp, kèm cảnh báo.",
        "**Điểm thưởng của lớp** trong kỳ, ghi rõ khoản nào chưa tính vào điểm thi đua.",
        "**Chi tiết sự việc**: Ngày, Đối tượng (tên học sinh hoặc “Tập thể lớp”), Lỗi, Điểm, Chi tiết, Trạng thái, Phản hồi GVCN, Khắc phục. Có ô tìm kiếm và lọc theo trạng thái.",
      ],
    },
    {
      kind: "table",
      caption: "Các nút trên đầu báo cáo",
      head: ["Nút", "Tác dụng"],
      rows: [
        ["[[Sao chép]]", "Chép báo cáo dạng tin nhắn ngắn gọn (mỗi sự việc một dòng, có cả biện pháp khắc phục) để dán vào Zalo hoặc tin nhắn."],
        ["[[In / Lưu PDF]]", "Mở hộp thoại in; chọn máy in hoặc lưu thành PDF. Báo cáo in có ô ký “Người lập báo cáo” và “Giáo viên chủ nhiệm”."],
        ["[[Xuất Excel]]", "Chỉ Quản trị: xuất danh sách sự việc của lớp, có Mã HS và biện pháp khắc phục."],
      ],
    },
    {
      kind: "steps",
      title: "GVCN phản hồi và ghi biện pháp khắc phục",
      items: [
        "Ở dòng sự việc, bấm [[Phản hồi]] (hoặc [[Sửa phản hồi]] nếu đã phản hồi). Có thể bấm vào dòng để xem chi tiết sự việc, học sinh và minh chứng trước. Trên điện thoại, chạm vào sự việc để mở chi tiết và ghi phản hồi ngay trong đó.",
        "Trong hộp **Phản hồi & khắc phục**, nhập **Phản hồi của GVCN** – có sẵn câu nhanh như “Đã nhắc nhở học sinh.”, “Đã trao đổi với phụ huynh.”.",
        "Nhập **Biện pháp xử lý / khắc phục** nếu có (không bắt buộc), ví dụ “Học sinh viết bản cam kết.”.",
        "Chọn **Trạng thái xử lý**: Mới ghi nhận, Đang xử lý hoặc Đã đóng (chọn “Đã đóng” khi sự việc đã xử lý xong).",
        "Bấm [[Gửi phản hồi]]. Nội dung hiện ngay trong báo cáo và trong chi tiết sự việc.",
      ],
    },
    { kind: "demo", demo: "status", caption: "Các nhãn trạng thái của sự việc, điểm thưởng và hành động (theo thứ tự xử lý)." },
    {
      kind: "p",
      text: "Cán bộ nền nếp và Quản trị dùng nút [[Khắc phục]] (hoặc [[Sửa khắc phục]]) trên dòng sự việc để ghi biện pháp khắc phục và trạng thái xử lý, rồi bấm [[Lưu khắc phục]]. Phần **Phản hồi của GVCN** do GVCN của lớp ghi; Quản trị cũng ghi được, trong chi tiết sự việc.",
    },
    {
      kind: "note",
      text: "Bộ lọc Mảng / Lỗi / Nhóm lỗi / Học sinh không áp dụng cho Báo GVCN – báo cáo luôn gồm mọi sự việc của lớp trong kỳ.",
    },
  ],
};

const hocSinh: GuideSection = {
  id: "hoc-sinh",
  title: "Học sinh",
  icon: "Users",
  group: "xem",
  roles: "all",
  route: "/hoc-sinh",
  summary: "Danh sách học sinh được ghi tên trong sự việc: số lượt, điểm, loại lỗi, cảnh báo tái phạm và lịch sử từng em.",
  blocks: [
    {
      kind: "p",
      text: "Trang [Học sinh](/hoc-sinh) liệt kê học sinh **được ghi tên** trong sự việc thuộc phạm vi lọc. Đầu trang có các ô **HS tái phạm**, **HS cảnh báo đỏ**, **Tỷ lệ HS có vi phạm**, biểu đồ **Top 10 học sinh nhiều lượt vi phạm nhất** và **Phân bố theo số lượt vi phạm**.",
    },
    {
      kind: "list",
      title: "Danh sách học sinh",
      items: [
        "Cột: Mã HS, Họ tên, Lớp, Số lượt, Điểm, Loại lỗi, Gần nhất, Cảnh báo.",
        "Ô **Tìm theo tên hoặc mã học sinh…**; nút lọc [[Tất cả]] · [[Tái phạm]] · [[Cảnh báo đỏ]]; ô **Số lượt vi phạm tối thiểu** (Từ 1, 2, 3 hoặc 5 lượt).",
        "Cột **Điểm** chỉ tính các lỗi tính theo học sinh (/HS); điểm của lỗi tính theo lần (/lần) không tính cho cá nhân.",
        "Quản trị có thêm [[Xuất Excel]] danh sách đang lọc.",
      ],
    },
    {
      kind: "steps",
      title: "Xem lịch sử nền nếp của một học sinh",
      items: [
        "Bấm vào tên học sinh (ở trang này, ở Tổng quan, Khối & lớp hoặc Báo GVCN).",
        "Bảng **Lịch sử nền nếp** mở ra: Mã HS, lớp, ngày sinh, cảnh báo; tổng **Lượt vi phạm**, **Điểm liên quan**, **Loại lỗi** và từng sự việc.",
        "Chọn **Phạm vi thời gian**: [[Kỳ đang lọc]] hoặc [[Cả năm]].",
        "Bấm [[Sao chép]] để chép lịch sử thành văn bản (ví dụ để trao đổi với phụ huynh).",
      ],
    },
    {
      kind: "note",
      text: "GVCN chỉ thấy học sinh của lớp chủ nhiệm. Muốn xem riêng một em ở mọi trang, dùng bộ lọc chung **Học sinh**.",
    },
  ],
};

const baoCao: GuideSection = {
  id: "bao-cao",
  title: "Báo cáo tuần/tháng",
  icon: "FileText",
  group: "xem",
  roles: "all",
  route: "/bao-cao",
  summary: "Báo cáo nền nếp khổ A4 theo tuần hoặc tháng, gửi Ban Giám hiệu, tổ khối hoặc GVCN: công tác phối hợp tuần/tháng mới, in, lưu PDF và xuất Excel chi tiết.",
  blocks: [
    {
      kind: "steps",
      title: "Lập báo cáo",
      items: [
        "Mở [Báo cáo tuần/tháng](/bao-cao).",
        "Ở **Kỳ báo cáo**, chọn [[Tuần]] hoặc [[Tháng]] rồi chọn tuần/tháng cụ thể.",
        "Ở **Người nhận**, chọn **Ban Giám hiệu – (cấp học)**, **Tổ khối N** hoặc **GVCN lớp X**. GVCN chỉ chọn được các lớp chủ nhiệm.",
        "Bật/tắt [[Kèm bảng chi tiết]] (mặc định bật với tổ khối và GVCN, tắt với BGH).",
        "Quản trị và Cán bộ nền nếp: ghi **Công tác phối hợp tuần mới** (báo cáo tháng: **tháng mới**) ở thẻ ngay dưới các nút điều khiển rồi bấm [[Lưu]] – xem phần dưới.",
        "Xem trước bản A4 ngay trên màn hình, rồi bấm [[In / Lưu PDF]]. Quản trị có thêm [[Xuất Excel chi tiết]].",
      ],
    },
    {
      kind: "steps",
      title: "Ghi công tác phối hợp tuần mới / tháng mới",
      items: [
        "Chọn kỳ báo cáo. Thẻ **Công tác phối hợp tuần mới** ghi rõ kỳ được giao việc: báo cáo tuần 19/10 – 25/10 → **Tuần 26/10 – 01/11**; báo cáo tháng 10 → **Tháng 11**.",
        "Bấm [[Thêm công việc]] cho mỗi việc: **Nội dung công việc** (bắt buộc, có thể xuống dòng), **Phụ trách / phối hợp** (ví dụ “GVCN khối 6, Đội TNTP”) và **Thời hạn** (ví dụ “Thứ Hai 26/10”, “Cả tuần”). Dùng nút mũi tên để đổi thứ tự, nút thùng rác để xóa; tối đa 30 công việc.",
        "Thêm **Ghi chú** nếu cần (in dưới bảng công việc).",
        "Bản A4 bên dưới hiện ngay nội dung đang gõ; nhãn **Chưa lưu** nhắc còn thay đổi chưa lưu. Bấm [[Lưu]] (hoặc Ctrl + Enter) để lưu, [[Hoàn tác]] để quay về bản đã lưu. Dòng “Đã lưu lúc …” cho biết lần lưu cuối và người lưu.",
      ],
    },
    {
      kind: "note",
      text: "Công tác phối hợp lưu theo **cấp học và kỳ báo cáo**, dùng chung cho mọi người nhận (BGH, tổ khối, GVCN) của kỳ đó. Chỉ **Quản trị** và **Cán bộ nền nếp** sửa được; **Người xem** và **GVCN** thấy nội dung đã lưu trong mục 5 của báo cáo. Nếu người khác vừa lưu cùng kỳ, phần mềm báo và mời [[Tải lại bản mới nhất]] – thay đổi chưa lưu của bạn sẽ được thay bằng bản mới, hãy nhập lại nếu cần. Đổi kỳ báo cáo, đổi cấp học hoặc rời trang khi còn thay đổi chưa lưu, phần mềm sẽ hỏi trước.",
    },
    {
      kind: "list",
      title: "Nội dung báo cáo",
      items: [
        "Tiêu đề “BÁO CÁO NỀN NẾP TUẦN …/THÁNG …”, cấp học, dòng **Kính gửi** và ngày lập.",
        "**Chỉ số chính** của phạm vi (so với kỳ trước).",
        "**Xếp hạng thi đua**: BGH – tóm tắt mọi khối; tổ khối – bảng của khối; GVCN – thứ hạng của lớp trong khối và nhóm Top (THCS: nhóm Dẫn đầu / Top >90% / Top 51%–90% / Top <51%, xem bảng dưới).",
        "**THPT**: thứ hạng tính chung toàn cấp (tổ khối thấy các lớp của khối với **hạng toàn cấp**), có cột **Lượt vi phạm** – bằng điểm thì lớp ít lượt vi phạm hơn xếp trên – và báo cáo nêu **Top 3 toàn cấp** (gồm cả lớp đồng hạng). Xem [Điểm thi đua, xếp hạng và Top 90%](#quy-tac-thi-dua).",
        "**Vấn đề nổi bật** (5 lỗi nhiều nhất, theo nhóm lỗi) và **Cảnh báo sớm** của phạm vi.",
        "**5. Công tác phối hợp tuần mới / tháng mới**: bảng STT, Nội dung công việc, Phụ trách / phối hợp, Thời hạn và ghi chú; chưa ghi thì in “Chưa cập nhật công tác phối hợp.”.",
        "**6. Chi tiết sự việc** (khi bật): Ngày, Mã sự việc, Lớp, Mã lỗi – Nội dung, Nhóm, Phạm vi, Đối tượng, Mã HS, Lượt, Điểm, Trạng thái, Khắc phục.",
        "Ô ký **Người lập báo cáo** và **Xác nhận của BGH**.",
      ],
    },
    {
      kind: "table",
      head: ["Nhóm (THCS)", "Lớp thuộc nhóm"],
      rows: [
        ["Dẫn đầu", "Lớp có điểm thi đua cao nhất khối – nếu nhiều lớp bằng điểm thì tất cả cùng dẫn đầu."],
        ["Top >90%", "Trên 90% điểm nền (báo cáo tuần: trên 90 điểm) đến dưới điểm dẫn đầu."],
        ["Top 51%–90%", "Từ 51% đến 90% điểm nền (báo cáo tuần: từ 51 đến 90 điểm)."],
        ["Top <51%", "Dưới 51% điểm nền (báo cáo tuần: dưới 51 điểm)."],
      ],
      caption: "THCS – xếp nhóm lớp trong báo cáo. Điểm nền = điểm cơ sở mỗi tuần (mặc định 100) × số tuần tính thi đua trong kỳ (tháng 4 tuần: 400). Kỳ không có tuần tính thi đua thì chưa xếp nhóm. Báo cáo BGH liệt kê lớp của từng nhóm theo khối; báo cáo tổ khối có thêm cột Tỉ lệ và Xếp nhóm; báo cáo GVCN ghi nhóm của lớp. Cấp Tiểu học (theo khối) và THPT (toàn cấp) vẫn dùng Top 90% theo thứ hạng.",
    },
    {
      kind: "tip",
      title: "Lưu thành PDF",
      text: "Trong hộp thoại in, chọn máy in là **Lưu dưới dạng PDF** (hoặc “Save as PDF”), khổ A4, hướng dọc. Tên tệp được đặt sẵn theo cấp học, kỳ và phạm vi báo cáo. Trên iPad/iPhone xem câu hỏi về in ở phần [Câu hỏi thường gặp](#cau-hoi-thuong-gap).",
    },
  ],
};

export const XEM_SECTIONS: GuideSection[] = [tongQuan, toanTruong, xepHang, khoiLop, baoGvcn, hocSinh, baoCao];
