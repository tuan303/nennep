/**
 * Hướng dẫn sử dụng – nhóm "Quy tắc tính điểm". Rules mirror the engine (src/lib/engine/{scoring,ranking,rag,
 * analytics-core,early-warning}.ts), KPI_TERMS and defaultLevelConfig in src/lib/constants.ts.
 * Numbers marked "mặc định" are the defaults – each level may change them in Cài đặt.
 */
import type { GuideSection } from "../types";

const diemTru: GuideSection = {
  id: "quy-tac-diem-tru",
  title: "Điểm trừ: tính theo học sinh (/HS) và theo lần (/lần)",
  icon: "Calculator",
  group: "quytac",
  roles: "all",
  summary: "Điểm trừ được tính tự động từ mức trừ và đơn vị của lỗi trong bảng điểm lỗi – không nhân đôi, không sửa tay.",
  blocks: [
    {
      kind: "p",
      text: "Mỗi lỗi trong **bảng điểm lỗi** có một **Mức trừ** và một **Đơn vị**: **/HS** (theo số học sinh) hoặc **/lần** (theo số lần). Điểm trừ của sự việc do phần mềm tính, người ghi không nhập tay.",
    },
    {
      kind: "table",
      head: ["Đơn vị", "Công thức", "Ví dụ"],
      rows: [
        ["/HS", "Mức trừ × số học sinh liên quan (có tên + chưa rõ tên)", "Lỗi 2 điểm/HS, ghi 3 học sinh → 2 × 3 = **6** điểm trừ"],
        ["/lần", "Mức trừ × số lần vi phạm", "Lỗi 5 điểm/lần, 2 lần → 5 × 2 = **10** điểm trừ (dù ghi tên bao nhiêu học sinh)"],
      ],
    },
    { kind: "demo", demo: "formula", caption: "Cách tính hiện ngay trên form nhập liệu." },
    {
      kind: "list",
      title: "Nguyên tắc",
      items: [
        "**Không nhân đôi**: một sự việc nhiều học sinh vẫn là một sự việc; lỗi /HS tính mỗi học sinh một lần mức trừ, lỗi /lần không nhân theo số học sinh.",
        "**Theo bảng điểm lỗi lúc ghi**: mức trừ, mảng, nhóm, đơn vị được lưu cùng sự việc tại thời điểm ghi. Sửa danh mục lỗi sau đó không làm đổi điểm của sự việc cũ.",
        "**Phạm vi**: Cá nhân bắt buộc có tên học sinh; số học sinh chưa rõ tên chỉ dùng cho lỗi /HS với phạm vi Tập thể.",
        "**Điểm trừ của lớp** = tổng điểm trừ các sự việc của lớp trong kỳ.",
        "**Điểm cá nhân của học sinh** (trang Học sinh, lịch sử học sinh) chỉ cộng các lỗi /HS mà em được ghi tên; lỗi /lần chỉ trừ điểm lớp, không tính cho cá nhân.",
      ],
    },
    {
      kind: "warn",
      title: "Vì sao có sự việc điểm trừ = 0?",
      text: "Lỗi /HS nhưng chưa có học sinh nào (thường do nhập từ Excel cũ) thì điểm trừ đang là 0 và sự việc ở trạng thái **Cần rà soát** (“Thiếu học sinh”). Bổ sung học sinh ở [Dữ liệu & rà soát](/du-lieu?tab=ra-soat) để điểm được tính đúng. Trên form nhập liệu, phần mềm không cho lưu lỗi /HS khi chưa chọn học sinh hoặc chưa nhập số HS chưa rõ tên.",
    },
  ],
};

const thiDua: GuideSection = {
  id: "quy-tac-thi-dua",
  title: "Điểm thi đua, xếp hạng và Top 90%",
  icon: "Trophy",
  group: "quytac",
  roles: "all",
  summary: "Điểm thi đua = Điểm nền + Điểm thưởng được tính − Điểm trừ; xếp hạng trong khối kiểu 1-2-2-4 và nhóm Top 90%.",
  blocks: [
    {
      kind: "p",
      text: "**Điểm thi đua = Điểm nền + Điểm thưởng (được tính) − Điểm trừ.** Điểm thi đua có thể âm.",
    },
    {
      kind: "list",
      items: [
        "**Điểm nền** = điểm nền mỗi tuần (mặc định 100) × **số tuần tính thi đua** trong kỳ. Tuần tính thi đua là tuần được bật “Tính thi đua” trong Lịch tuần **và đã bắt đầu** – tháng/học kỳ đang diễn ra chỉ tính các tuần đã qua và tuần hiện tại. Kỳ Tuần: 1 tuần nếu tuần đó được tính, ngược lại 0.",
        "Tuần nghỉ lễ, tuần thi… được Quản trị tắt “Tính thi đua” thì không cộng điểm nền cho lớp nào.",
        "**Điểm thưởng được tính**: chỉ các khoản ở trạng thái được tính (mặc định **Đã xác nhận**). Với cấu hình mặc định, khoản Mới ghi nhận, Đang xác minh hiện trong danh sách nhưng chưa cộng. Đề xuất của GVCN luôn chỉ được cộng khi đã ở trạng thái Đã xác nhận.",
        "**Điểm trừ**: tổng điểm trừ mọi sự việc của lớp trong kỳ – xếp hạng luôn tính mọi lỗi, không theo bộ lọc mảng/lỗi.",
      ],
    },
    {
      kind: "p",
      text: "**Xếp hạng** tính riêng trong từng khối, trên tất cả lớp đang hoạt động của khối, điểm cao xếp trên. Các lớp bằng điểm thì **đồng hạng** và hạng kế tiếp bỏ qua tương ứng (kiểu 1-2-2-4).",
    },
    {
      kind: "table",
      caption: "Ví dụ xếp hạng 1-2-2-4 (dữ liệu minh họa)",
      head: ["Lớp", "Điểm thi đua", "Hạng"],
      rows: [
        ["6A01", "398", "1"],
        ["6A02", "395", "2"],
        ["6A03", "395", "2"],
        ["6A04", "390", "4"],
      ],
    },
    {
      kind: "p",
      text: "**Top 90%**: ngưỡng = làm tròn lên 90% × số lớp của khối (tỷ lệ do Quản trị cấu hình). Lớp có hạng ≤ ngưỡng **Thuộc Top 90%**, còn lại **Ngoài Top 90%**; các lớp đồng hạng tại ngưỡng đều thuộc Top. Ví dụ khối có 12 lớp: 90% × 12 = 10,8 → làm tròn lên 11, nên lớp hạng 1 đến 11 thuộc Top 90%.",
    },
    { kind: "demo", demo: "top90", caption: "Nhãn Thuộc Top / Ngoài Top trên bảng xếp hạng." },
    {
      kind: "tip",
      text: "Dải giải thích đầu trang [Xếp hạng](/xep-hang) luôn ghi số tuần tính điểm, điểm nền của kỳ, công thức và ngưỡng Top đang áp dụng cho cấp học.",
    },
  ],
};

const rag: GuideSection = {
  id: "quy-tac-rag",
  title: "Màu cảnh báo RAG và độ tin cậy dữ liệu",
  icon: "Gauge",
  group: "quytac",
  roles: "all",
  summary: "Lớp được tô Xanh / Vàng / Đỏ theo điểm trừ trung bình mỗi tuần; Xám khi ngưỡng chưa phê duyệt hoặc dữ liệu chưa đủ tin cậy.",
  blocks: [
    {
      kind: "p",
      text: "Mỗi lớp được xếp mức cảnh báo theo **điểm trừ trung bình mỗi tuần tính thi đua** trong kỳ (= điểm trừ ÷ số tuần tính, tối thiểu 1). Màu luôn đi kèm biểu tượng và chữ; rê chuột hoặc chạm vào nhãn để xem lý do cụ thể.",
    },
    {
      kind: "table",
      head: ["Mức", "Khi nào"],
      rows: [
        ["Xanh – Ổn định", "Trung bình dưới ngưỡng Vàng."],
        ["Vàng – Cần chú ý", "Từ ngưỡng Vàng đến dưới ngưỡng Đỏ."],
        ["Đỏ – Cần can thiệp", "Từ ngưỡng Đỏ trở lên."],
        ["Xám – Chưa đủ dữ liệu", "Ngưỡng cảnh báo **chưa được phê duyệt**, hoặc **độ tin cậy dữ liệu** của lớp thấp hơn mức tối thiểu."],
      ],
    },
    { kind: "demo", demo: "rag", caption: "Bốn mức RAG." },
    {
      kind: "note",
      text: "Ngưỡng do Quản trị nhập và chỉ có hiệu lực sau khi được phê duyệt (Cài đặt → Cấu hình thi đua). Giá trị mặc định khi mới cài: Vàng 10 và Đỏ 25 điểm trừ/tuần, độ tin cậy tối thiểu 80% – ngưỡng thực tế của từng cấp xem ở mục “Mức cảnh báo” trên trang Xếp hạng.",
    },
    {
      kind: "p",
      text: "**Độ tin cậy dữ liệu** = (số sự việc Hợp lệ + Thiếu tên HS) ÷ tổng số sự việc trong phạm vi; bằng 100% khi chưa có sự việc. Sự việc **Cần rà soát** làm giảm độ tin cậy – rà soát kịp thời giúp lớp không bị chuyển sang Xám.",
    },
    { kind: "demo", demo: "datacheck", caption: "Hợp lệ và Thiếu tên HS được tính là đáng tin cậy; Cần rà soát thì không." },
    {
      kind: "p",
      text: "**Lớp tái phạm**: lớp có điểm trừ tuần từ ngưỡng Vàng trở lên trong ít nhất 2 tuần tính thi đua liên tiếp gần nhất (thẻ Tái phạm trên Tổng quan).",
    },
  ],
};

const soLieu: GuideSection = {
  id: "quy-tac-so-lieu",
  title: "Sự việc, lượt vi phạm và số học sinh",
  icon: "Hash",
  group: "quytac",
  roles: "all",
  summary: "Phân biệt Sự việc, Lượt vi phạm, Số HS vi phạm và HS liên quan – bốn con số dùng thống nhất trên mọi màn hình.",
  blocks: [
    {
      kind: "table",
      head: ["Chỉ số", "Cách đếm"],
      rows: [
        ["Sự việc", "Số lần ghi nhận nền nếp: mỗi mã sự việc (NN-…) là 1 sự việc, dù liên quan 1 hay nhiều học sinh."],
        ["Lượt vi phạm", "Lỗi /HS: mỗi học sinh liên quan là 1 lượt (kể cả HS chưa rõ tên). Lỗi /lần: mỗi lần vi phạm là 1 lượt."],
        ["Số HS vi phạm", "Số học sinh khác nhau được ghi tên – mỗi em chỉ đếm 1 lần; không gồm học sinh chưa rõ tên."],
        ["HS liên quan", "Tổng lượt học sinh liên quan của các sự việc, gồm cả học sinh chưa rõ tên (một em có 2 sự việc được đếm 2 lần)."],
        ["Điểm trừ", "Tổng điểm trừ theo bảng điểm lỗi; không nhân đôi khi một sự việc có nhiều học sinh."],
        ["Điểm thưởng", "Tổng điểm thưởng ở các trạng thái được tính vào thi đua."],
      ],
    },
    {
      kind: "table",
      caption: "Ví dụ một lớp trong tuần (dữ liệu minh họa)",
      head: ["Sự việc", "Lỗi", "Học sinh", "Điểm trừ", "Lượt vi phạm"],
      rows: [
        ["Sự việc 1", "2 điểm/HS, Cá nhân", "Nguyễn Văn A, Trần Thị B", "2 × 2 = 4", "2"],
        ["Sự việc 2", "5 điểm/lần, 2 lần, Tập thể", "Ghi tên Nguyễn Văn A để tham chiếu", "5 × 2 = 10", "2"],
        ["Sự việc 3", "2 điểm/HS, Tập thể", "Lê Văn C + 2 HS chưa rõ tên", "2 × 3 = 6", "3"],
      ],
    },
    {
      kind: "p",
      text: "Kết quả: **Sự việc = 3**; **Lượt vi phạm = 7**; **Số HS vi phạm = 3** (A, B, C); **HS liên quan = 6** (2 + 1 + 3); **Điểm trừ = 20**. Trên trang Học sinh, Nguyễn Văn A có **2 lượt** nhưng **điểm cá nhân 2** – vì lỗi /lần ở sự việc 2 không tính cho cá nhân.",
    },
    { kind: "demo", demo: "kpi", caption: "Ô chỉ số có biểu tượng ⓘ giải thích đúng cách đếm này." },
  ],
};

const canhBao: GuideSection = {
  id: "quy-tac-canh-bao",
  title: "Cảnh báo học sinh và cảnh báo sớm",
  icon: "BellRing",
  group: "quytac",
  roles: "all",
  summary: "Khi nào học sinh bị Cảnh báo đỏ, Tái phạm; khi nào lớp bị Tăng lỗi, Lỗi kéo dài; sự việc nào là nghiêm trọng.",
  blocks: [
    {
      kind: "table",
      caption: "Cảnh báo học sinh (Cài đặt → Cấu hình thi đua → Cảnh báo học sinh)",
      head: ["Nhãn", "Điều kiện (mặc định)"],
      rows: [
        ["Cảnh báo đỏ", "Có từ 3 lượt vi phạm trở lên trong cùng một tuần."],
        ["Tái phạm", "Có từ 2 lượt vi phạm trở lên trong vòng 4 tuần (tính đến tuần có lượt vi phạm trong kỳ đang xem)."],
      ],
    },
    {
      kind: "table",
      caption: "Bốn loại cảnh báo sớm (Cài đặt → Cảnh báo sớm)",
      head: ["Loại", "Điều kiện (mặc định)", "Mức"],
      rows: [
        ["Tái phạm", "Học sinh có Cảnh báo đỏ hoặc Tái phạm trong kỳ.", "Cảnh báo đỏ: cao · Tái phạm: trung bình"],
        ["Tăng lỗi", "Điểm trừ của lớp trong tuần đang xét từ 6 điểm trở lên **và** tăng từ 50% so với trung bình 4 tuần tính thi đua liền trước.", "Cao khi điểm trừ tuần đạt ngưỡng Đỏ, còn lại trung bình"],
        ["Lỗi kéo dài", "Lớp mắc cùng một lỗi từ 3 tuần tính thi đua liên tiếp (bỏ qua tuần nghỉ).", "Cao khi kéo dài từ 5 tuần (ngưỡng + 2), còn lại trung bình"],
        ["Sự việc nghiêm trọng", "Sự việc chưa “Đã đóng” thuộc nhóm lỗi nghiêm trọng (mặc định Nhóm 3, Nhóm 4). Quản trị có thể bật thêm điều kiện **hoặc** mức trừ từ một số điểm nhất định – mặc định không dùng (0).", "Mới ghi nhận: cao · Đang xử lý: trung bình"],
      ],
    },
    {
      kind: "note",
      text: "**Tuần đang xét** (dùng cho Tăng lỗi và Lỗi kéo dài): khi lọc theo Tuần là chính tuần đó; khi lọc theo Tháng/Học kỳ/Toàn bộ là tuần gần nhất đã bắt đầu trong kỳ. Sự việc nghiêm trọng hết bị cảnh báo khi được chuyển sang trạng thái **Đã đóng**.",
    },
    {
      kind: "tip",
      text: "Xem và xử lý cảnh báo ở thẻ Cảnh báo sớm trên [Tổng quan](/) và tab [Cảnh báo sớm](/hanh-dong?tab=canh-bao) của trang Hành động; Quản trị có thể tạo hành động ngay từ cảnh báo.",
    },
  ],
};

export const QUYTAC_SECTIONS: GuideSection[] = [diemTru, thiDua, rag, soLieu, canhBao];
