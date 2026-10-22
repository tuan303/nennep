/**
 * Hướng dẫn sử dụng – nhóm "Quản trị": Quản lý học sinh, Dữ liệu & rà soát, Nhập/Xuất Excel, Nhật ký, Cài đặt.
 * Labels follow src/components/{student-admin,data-inspect,excel-io,audit,settings}/**.
 */
import type { GuideSection } from "../types";

const quanLyHocSinh: GuideSection = {
  id: "quan-ly-hoc-sinh",
  title: "Quản lý học sinh",
  icon: "UserCog",
  group: "quantri",
  roles: ["ADMIN"],
  route: "/quan-ly-hoc-sinh",
  summary: "Hồ sơ học sinh: thêm (tuyển mới, chuyển đến), chuyển lớp, chuyển trường, chuyển cấp, khôi phục và nhập danh sách từ Excel.",
  blocks: [
    {
      kind: "p",
      text: "Trang [Quản lý học sinh](/quan-ly-hoc-sinh) giữ danh sách học sinh của cấp đang chọn. Đầu trang có các ô **Đang học**, **Đã chuyển / nghỉ**, **Lớp lệch sĩ số**, **HS có vi phạm**; bên dưới là hai tab [[Danh sách học sinh]] và [[Sĩ số theo lớp]]. Tìm theo tên hoặc Mã HS, lọc theo khối, lớp và trạng thái ([[Đang học]] · [[Đã chuyển/nghỉ]] · [[Tất cả]]).",
    },
    {
      kind: "steps",
      title: "Thêm một học sinh",
      items: [
        "Bấm [[Thêm học sinh]].",
        "Chọn **Hình thức**: [[Tuyển mới]] hoặc [[Chuyển đến]].",
        "Nhập **Mã HS** (không trùng trong toàn trường, không có khoảng trắng), **Lớp**, **Họ và tên**, **Ngày sinh**, **Giới tính**, ngày nhập học hoặc ngày chuyển đến và **Ghi chú** nếu cần.",
        "Bấm [[Thêm học sinh]] để lưu. Học sinh xuất hiện ngay trong danh sách chọn của form nhập sự việc.",
      ],
    },
    {
      kind: "table",
      caption: "Các thao tác trên từng học sinh (menu Thao tác ở cuối dòng)",
      head: ["Thao tác", "Dùng khi"],
      rows: [
        ["Xem hồ sơ", "Xem thông tin, số lượt vi phạm, điểm liên quan và diễn biến hồ sơ (tuyển mới, chuyển lớp…)."],
        ["Lịch sử vi phạm", "Mở lịch sử nền nếp của học sinh."],
        ["Sửa thông tin", "Sửa họ tên, ngày sinh, giới tính, ghi chú. Đổi lớp hoặc trạng thái dùng các thao tác bên dưới."],
        ["Chuyển lớp", "Chọn **Lớp mới** và **Ngày hiệu lực**. Lịch sử vi phạm ở lớp cũ được giữ nguyên."],
        ["Chuyển trường đi / Tốt nghiệp", "Chọn **Trạng thái mới**: Chuyển trường, Tốt nghiệp hoặc Ngừng theo dõi; nhập ngày và lý do, rồi bấm nút xác nhận tương ứng."],
        ["Khôi phục (đang học)", "Học sinh quay lại trường: chọn lớp, ngày quay lại → [[Khôi phục]]."],
        ["Chuyển cấp (giữ Mã HS)", "Học sinh lên cấp học mới (ví dụ hết lớp 5 lên lớp 6): chọn **Cấp học mới**, **Vào lớp**, **Ngày hiệu lực** → [[Chuyển cấp]]. Mã HS và lịch sử được giữ nguyên."],
      ],
    },
    {
      kind: "note",
      text: "Học sinh đã chuyển trường, tốt nghiệp hay ngừng theo dõi không còn trong danh sách lớp và không chọn được khi nhập sự việc mới, nhưng **lịch sử vi phạm và điểm trừ cũ của lớp vẫn được giữ**.",
    },
    {
      kind: "steps",
      title: "Nhập danh sách học sinh từ Excel (4 bước)",
      items: [
        "Bấm [[Import danh sách]]. **Tải file**: file `.xlsx` (tối đa 10 MB và 6.000 học sinh), có các cột **Mã HS**, **Họ và tên**, **Lớp**; Ngày sinh, Giới tính, Trạng thái là tùy chọn. Kéo thả file hoặc bấm để chọn.",
        "**Tùy chọn** – Cách cập nhật: [[Thêm & cập nhật]] (thêm học sinh mới, cập nhật thông tin, chuyển lớp theo file; học sinh không có trong file giữ nguyên) hoặc [[Đồng bộ toàn bộ]]. Chọn **Ngày hiệu lực**, rồi bấm [[Kiểm tra trước]] (chưa có gì được ghi ở bước này).",
        "**Xem trước** – Từng dòng được phân loại: Tuyển mới, Cập nhật thông tin, Chuyển lớp, Quay lại, Không đổi, Lỗi (dòng bị bỏ qua), Không có trong file. Lọc [[Có thay đổi hoặc lỗi]] để rà nhanh.",
        "Bấm [[Cập nhật N học sinh]] (N là số học sinh có thay đổi) và xác nhận lại trong hộp thoại. Bước **Hoàn tất** cho biết số học sinh đã được thêm mới, cập nhật, chuyển lớp, quay lại.",
      ],
    },
    {
      kind: "warn",
      title: "Đồng bộ toàn bộ",
      text: "Chỉ dùng khi file là **danh sách đầy đủ của cả cấp học**. Ở bước Xem trước, phần mềm liệt kê học sinh đang học nhưng không có trong file; thầy/cô tự chọn có đánh dấu các em là Đã chuyển trường hay không (có thể khôi phục từng em sau).",
    },
    {
      kind: "list",
      title: "Khác",
      items: [
        "[[Xuất danh sách]] (trên điện thoại: Xuất Excel) xuất các học sinh đang lọc ra file Excel.",
        "Tab [[Sĩ số theo lớp]] so sánh số học sinh đang học với **sĩ số nguồn** khai ở Cài đặt → Lớp & GVCN; bật **Chỉ lớp lệch sĩ số** để xem lớp cần kiểm tra.",
      ],
    },
  ],
};

const duLieu: GuideSection = {
  id: "du-lieu",
  title: "Dữ liệu & rà soát",
  icon: "Database",
  group: "quantri",
  roles: ["ADMIN", "EDITOR"],
  route: "/du-lieu",
  summary: "Toàn bộ sự việc, hàng đợi cần rà soát, sự việc có thể trùng, điểm thưởng, bản ghi đã xóa và chất lượng dữ liệu.",
  blocks: [
    {
      kind: "p",
      text: "Trang [Dữ liệu & rà soát](/du-lieu) giúp giữ dữ liệu sạch để điểm và xếp hạng chính xác. Trang theo bộ lọc chung và có các tab: [[Tất cả sự việc]], [[Cần rà soát]], [[Có thể trùng]], [[Điểm thưởng]], [[Đã xóa]] (chỉ Quản trị) và [[Chất lượng dữ liệu]].",
    },
    {
      kind: "p",
      text: "Mỗi sự việc có một nhãn **Kiểm tra dữ liệu**: **Hợp lệ**; **Thiếu tên HS** (có học sinh chưa rõ tên – vẫn tính điểm, nên bổ sung tên khi biết); **Cần rà soát** (thiếu dữ liệu hoặc lệch quy định – làm giảm độ tin cậy dữ liệu).",
    },
    { kind: "demo", demo: "datacheck", caption: "Ba nhãn kiểm tra dữ liệu của sự việc." },
    {
      kind: "list",
      title: "Tất cả sự việc",
      items: [
        "Bảng đầy đủ: Mã, Ngày, Lớp, Lỗi, Đơn vị, Số HS/Số lần, Điểm, Phạm vi, Người ghi, Trạng thái, Kiểm tra, Nguồn (Ghi nhận trên ứng dụng hoặc Nhập từ Excel).",
        "Tìm theo mã, lớp, lỗi, tên học sinh, chi tiết; lọc theo nguồn và kết quả kiểm tra. Bấm một dòng để xem chi tiết.",
      ],
    },
    {
      kind: "steps",
      title: "Xử lý mục Cần rà soát",
      items: [
        "Mở tab [Cần rà soát](/du-lieu?tab=ra-soat); lọc theo **loại vấn đề** nếu cần.",
        "Đọc mục **Vấn đề dữ liệu** của từng sự việc (ví dụ “Thiếu học sinh”, “Lệch điểm khi nhập”, “Học sinh khác lớp”, “Thiếu tên HS”).",
        "Với sự việc thiếu học sinh hoặc thiếu tên, bấm [[Bổ sung học sinh]]: chọn phạm vi, học sinh liên quan hoặc số HS chưa rõ tên, xem **Kết quả sau khi lưu** rồi lưu.",
        "Các trường hợp khác bấm [[Mở để sửa]] (hiện khi thầy/cô có quyền sửa bản ghi) hoặc [[Xem chi tiết]] để xem sự việc.",
      ],
    },
    {
      kind: "note",
      text: "“Chỉ quản trị hoặc người tạo trong 24 giờ mới sửa được.” Cán bộ nền nếp thấy toàn bộ hàng đợi, nhưng chỉ sửa được bản ghi của mình trong 24 giờ; các bản ghi khác báo Quản trị xử lý.",
    },
    {
      kind: "list",
      title: "Có thể trùng",
      items: [
        "Tab [Có thể trùng](/du-lieu?tab=trung-lap) gom các nhóm sự việc **cùng ngày, cùng lớp, cùng lỗi và có chung học sinh** (hoặc cùng không ghi tên học sinh nào), kèm số điểm có thể bị tính trùng.",
        "Nếu là các sự việc khác nhau, bấm [[Không trùng]] – nhóm sẽ không bị báo lại.",
        "Nếu ghi trùng thật, bấm [[Mở]] ở sự việc thừa; Quản trị xóa bản ghi đó với lý do (được điền sẵn dạng “Trùng với NN-…”).",
        "Mặc định chỉ xét kỳ đang lọc; bấm [[Kiểm tra cả năm học]] để xét toàn năm.",
      ],
    },
    {
      kind: "list",
      title: "Điểm thưởng · Đã xóa · Chất lượng dữ liệu",
      items: [
        "[[Điểm thưởng]]: mọi khoản thưởng trong kỳ, có cột **Tính thi đua** và lọc theo trạng thái.",
        "[[Đã xóa]] (Quản trị): sự việc và điểm thưởng đã xóa mềm của cả cấp học (không theo bộ lọc kỳ), kèm người xóa và lý do. Bấm [[Khôi phục]] để đưa bản ghi trở lại thống kê, xếp hạng và báo cáo.",
        "[[Chất lượng dữ liệu]]: độ tin cậy tổng thể và theo lớp (so với ngưỡng tối thiểu), vấn đề theo loại, theo nguồn, theo người ghi, xu hướng theo tuần và thẻ **Kiểm tra công thức & dữ liệu** – tính lại điểm trừ, số học sinh của các sự việc đã lưu để phát hiện sai lệch.",
      ],
    },
  ],
};

const nhapXuat: GuideSection = {
  id: "nhap-xuat",
  title: "Nhập/Xuất Excel",
  icon: "FileSpreadsheet",
  group: "quantri",
  roles: ["ADMIN"],
  route: "/nhap-xuat",
  summary: "Nhập sổ nền nếp từ Excel có kiểm tra trước từng dòng, xuất workbook của cấp học và bản chụp báo cáo HTML.",
  blocks: [
    {
      kind: "steps",
      title: "Nhập sổ nền nếp từ Excel (4 bước)",
      items: [
        "**Tải file** – Kéo thả hoặc chọn file `.xlsx` đúng mẫu sổ nền nếp (file `.xls` cần mở bằng Excel và lưu lại dạng `.xlsx`; file không được đặt mật khẩu).",
        "**Chọn dữ liệu** – Tích các phần cần nhập: Lớp & GVCN, Bảng điểm lỗi, Cấu hình, Lịch tuần, Học sinh, Sự việc (+ HS liên quan), Điểm thưởng.",
        "**Kiểm tra trước** – Bấm [[Kiểm tra trước]]. Phần mềm đối chiếu từng dòng và báo **Hợp lệ**, **Cảnh báo** hoặc **Lỗi**, cùng số dòng **Sẽ tạo**, **Sẽ cập nhật**, **Bỏ qua**. Chưa có dữ liệu nào được ghi ở bước này.",
        "**Xác nhận nhập** – Đọc kỹ tóm tắt rồi bấm [[Xác nhận nhập]]. Thao tác được ghi vào nhật ký và có thể mất đến 1 phút.",
      ],
    },
    {
      kind: "table",
      caption: "Kết quả kiểm tra từng dòng",
      head: ["Mức", "Cách hệ thống xử lý"],
      rows: [
        ["Hợp lệ", "Được nhập."],
        ["Cảnh báo", "Vẫn được nhập, nhưng sự việc ở trạng thái **Cần rà soát** để xem lại."],
        ["Lỗi", "Không được nhập (ví dụ thiếu thông tin, lớp không có trong danh mục, trùng mã)."],
      ],
    },
    {
      kind: "warn",
      title: "Ghi đè thay đổi trong phần mềm",
      text: "Mặc định, bản ghi đã được sửa trong phần mềm sau lần nhập trước (phản hồi GVCN, sửa khi rà soát, chuyển lớp…) được **giữ nguyên** và dòng tương ứng chỉ báo Cảnh báo; dòng có mã trùng nhưng khác lớp hoặc khác lỗi bị báo Lỗi. Chỉ tích [[Ghi đè thay đổi trong phần mềm]] khi file là bản đúng nhất – khi đó nội dung trong file thay thế cả phản hồi và trạng thái do GVCN đã cập nhật. Nhập phần **Cấu hình** sẽ ghi đè cấu hình đã phê duyệt.",
    },
    {
      kind: "tip",
      title: "Mẹo: bắt đầu từ file xuất của hệ thống",
      text: "Bấm [[Xuất Excel]], chỉnh sửa trực tiếp trên file đó rồi nhập lại – cấu trúc luôn đúng và không tạo bản ghi trùng (dòng có Mã sự việc đã có được đối chiếu với bản ghi hiện có thay vì tạo mới). Khung **Mẫu file Excel** liệt kê các trang và cột hệ thống đọc.",
    },
    {
      kind: "list",
      title: "Xuất dữ liệu",
      items: [
        "**Xuất workbook Excel** – toàn bộ dữ liệu cấp học của năm học: các trang Nhập liệu, HS liên quan, DS Học sinh, Danh mục, Bảng điểm lỗi, Cấu hình, Lịch tuần, Điểm thưởng, Xếp hạng, BC Học sinh. **Kỳ báo cáo** chọn ở trên áp dụng cho trang Xếp hạng, BC Học sinh và bản chụp HTML. Bấm [[Xuất Excel]].",
        "**Bản chụp HTML (offline)** – báo cáo một trang mở được không cần mạng, để lưu trữ/chia sẻ. Bấm [[Tải bản chụp HTML]]. Không dùng file này để nhập lại.",
      ],
    },
    {
      kind: "tip",
      title: "Sao lưu định kỳ",
      text: "Nên xuất workbook Excel của từng cấp học định kỳ (ví dụ cuối mỗi tháng và cuối học kỳ) và cất ở nơi lưu trữ nội bộ của trường. File có tên học sinh – không chia sẻ công khai.",
    },
  ],
};

const nhatKy: GuideSection = {
  id: "nhat-ky",
  title: "Nhật ký",
  icon: "ScrollText",
  group: "quantri",
  roles: ["ADMIN"],
  route: "/nhat-ky",
  summary: "Theo dõi đăng nhập và mọi thao tác thay đổi dữ liệu; nhật ký chỉ được ghi thêm, không thể sửa hay xóa.",
  blocks: [
    {
      kind: "p",
      text: "[Nhật ký](/nhat-ky) dành cho **quản trị toàn trường**. Đầu trang có các ô **Đăng nhập hôm nay**, **Đăng nhập thất bại hôm nay** (cảnh báo khi vượt ngưỡng trong ngày), **Nhập dữ liệu tuần này** và **Bản ghi đã tải**.",
    },
    {
      kind: "steps",
      title: "Tra cứu một thao tác",
      items: [
        "Ở bộ lọc phía trên bảng, chọn **Hành động** (ví dụ “Sửa sự việc”, “Xóa sự việc”, “Đặt lại mật khẩu”), **Email** (email đầy đủ để lọc chính xác), **Cấp học**, **Từ ngày** – **Đến ngày** hoặc khoảng nhanh (Hôm nay, Tuần này, 7 ngày, 30 ngày).",
        "Bấm [[Lọc]]. Bảng hiện Thời gian, Người dùng, Hành động, Đối tượng, Cấp, Tóm tắt.",
        "Bấm một dòng để xem chi tiết: phần **Thay đổi** cho biết trường nào đổi từ giá trị nào thành giá trị nào; phần **Chi tiết (JSON)** dành cho hỗ trợ kỹ thuật.",
        "Chưa thấy bản ghi cần tìm? Bấm [[Tìm tiếp]] hoặc nút **Tải thêm … bản ghi** ở cuối bảng để quét các bản ghi cũ hơn.",
      ],
    },
    {
      kind: "tip",
      text: "Bấm [[Xuất Excel]] để lưu các bản ghi đang hiển thị (ví dụ khi cần báo cáo ai đã sửa dữ liệu trong một khoảng thời gian).",
    },
  ],
};

const caiDat: GuideSection = {
  id: "cai-dat",
  title: "Cài đặt",
  icon: "Settings",
  group: "quantri",
  roles: ["ADMIN"],
  route: "/cai-dat",
  summary: "Cấu hình thi đua và phê duyệt ngưỡng, cảnh báo sớm, danh mục lỗi, lớp & GVCN, lịch tuần, người dùng và bảo trì.",
  blocks: [
    {
      kind: "p",
      text: "[Cài đặt](/cai-dat) gồm các tab: [[Cấu hình thi đua]], [[Cảnh báo sớm]], [[Danh mục lỗi]], [[Lớp & GVCN]], [[Lịch tuần]], [[Người dùng]], [[Bảo trì]]. Mọi tab (trừ Người dùng) áp dụng cho **cấp học đang chọn** ở thanh trên cùng. Sửa xong bấm [[Lưu thay đổi]] ở thanh dưới của tab ([[Hoàn tác]] để bỏ); rời trang khi còn thay đổi chưa lưu, phần mềm sẽ hỏi lại.",
    },
    {
      kind: "list",
      title: "Cấu hình thi đua",
      items: [
        "**Năm học & điểm nền**: Năm học (dạng 2026-2027), **Điểm nền / lớp / tuần**, **Tuần đầu tính thi đua** (phải là Thứ Hai), các **Học kỳ** (Bắt đầu – Kết thúc).",
        "**Ngưỡng cảnh báo RAG**: mức Vàng (“Cần chú ý”) và mức Đỏ (“Cần can thiệp”) theo điểm trừ trung bình mỗi tuần, **Độ tin cậy tối thiểu**, và công tắc **Phê duyệt ngưỡng cảnh báo**.",
        "**Điểm thưởng & Top**: **Trạng thái điểm thưởng được tính** (mặc định chỉ Đã xác nhận; đề xuất của GVCN luôn chỉ được tính khi Đã xác nhận) và **Tỷ lệ Top (%)** (mặc định 90%).",
        "**Cảnh báo học sinh**: Cảnh báo đỏ từ n lượt vi phạm trong 1 tuần (mặc định 3); Tái phạm từ n lượt trong vòng n tuần gần nhất (mặc định 2 lượt trong 4 tuần).",
        "**Thời hạn xử lý hành động**: số ngày cho mức Cao, Trung bình, Thấp.",
      ],
    },
    {
      kind: "steps",
      title: "Phê duyệt ngưỡng cảnh báo RAG",
      items: [
        "Nhập mức Vàng và mức Đỏ (Đỏ phải lớn hơn Vàng) theo nội dung BGH đã thống nhất.",
        "Bật công tắc [[Phê duyệt ngưỡng cảnh báo]] và bấm [[Xác nhận phê duyệt]] trong hộp xác nhận.",
        "Bấm [[Lưu thay đổi]]. Từ lúc này các lớp hiện màu Xanh / Vàng / Đỏ thay cho Xám.",
      ],
    },
    {
      kind: "warn",
      text: "Khi sửa ngưỡng sau này, phần phê duyệt tự tắt (“Đã tắt phê duyệt vì ngưỡng thay đổi”) và mọi lớp trở về Xám cho đến khi phê duyệt lại. Đổi ngày học kỳ không tự đổi lịch tuần – vào [[Lịch tuần]] bấm [[Tạo lại từ cấu hình]] nếu cần.",
    },
    {
      kind: "list",
      title: "Cảnh báo sớm",
      items: [
        "**Lớp tăng lỗi**: Tăng từ …% so với trung bình các tuần làm nền; Điểm trừ tối thiểu trong tuần đang xét; Số tuần làm nền (mặc định 50%, 6 điểm, 4 tuần).",
        "**Lỗi kéo dài**: Số tuần liên tiếp (tuần tính thi đua, bỏ qua tuần nghỉ; mặc định 3 tuần).",
        "**Sự việc nghiêm trọng**: chọn các nhóm lỗi nghiêm trọng (mặc định Nhóm 3, Nhóm 4) và/hoặc **Hoặc mức trừ từ** … điểm (mặc định 0 = không dùng).",
        "Ô **Xem trước** cho biết với ngưỡng đang nhập sẽ có bao nhiêu cảnh báo trong tuần hiện tại. Ngưỡng tái phạm của học sinh đặt ở Cấu hình thi đua → Cảnh báo học sinh.",
      ],
    },
    {
      kind: "list",
      title: "Danh mục lỗi",
      items: [
        "Sửa trực tiếp trên bảng: Mã, Mảng, Nội dung lỗi, Nhóm, Mức trừ, Đơn vị (/HS – nhân với số học sinh; /lần – nhân với số lần), 5S (tính vào theo dõi 5S), Đang dùng. Bấm [[Thêm lỗi]] để thêm dòng mới.",
        "Thay đổi chỉ áp dụng cho sự việc ghi nhận sau – sự việc cũ giữ nguyên mức trừ đã ghi.",
        "Lỗi không dùng nữa thì tắt **Đang dùng** (ẩn khỏi danh sách chọn, dữ liệu cũ giữ nguyên) thay vì xóa.",
      ],
    },
    {
      kind: "list",
      title: "Lớp & GVCN",
      items: [
        "Bấm [[Thêm lớp]] hoặc [[Sửa]] ở từng lớp: Mã lớp (không đổi được sau khi lưu), Thứ tự hiển thị, Khối, Hệ, Sĩ số (theo danh sách nguồn), GVCN, Phó chủ nhiệm, SĐT GVCN, **Email GVCN** (dùng để tạo tài khoản GVCN hàng loạt), **Lớp đang hoạt động**.",
        "Thay đổi được ghi vào danh sách; bấm [[Lưu thay đổi]] để lưu lên hệ thống.",
        "Lớp không còn học: tắt **Lớp đang hoạt động** – lớp ẩn khỏi danh sách chọn và bảng xếp hạng, dữ liệu cũ giữ nguyên.",
      ],
    },
    {
      kind: "list",
      title: "Lịch tuần",
      items: [
        "Các tuần trong năm học (bắt đầu Thứ Hai) với Tháng, Học kỳ, công tắc **Tính thi đua** và Ghi chú.",
        "Tắt **Tính thi đua** cho tuần nghỉ lễ, tuần thi… để không cộng điểm nền; ghi rõ lý do ở Ghi chú (ví dụ “Nghỉ lễ 2/9”).",
        "[[Tạo lại từ cấu hình]] tạo lại các tuần theo tuần đầu và học kỳ đã lưu, giữ nguyên trạng thái và ghi chú của các tuần đã có.",
        "Nếu bỏ những tuần còn sự việc/điểm thưởng, phần mềm hỏi lại vì các bản ghi đó sẽ bị ẩn khỏi thống kê.",
      ],
    },
    {
      kind: "steps",
      title: "Người dùng (quản trị toàn trường)",
      items: [
        "Bấm [[Thêm người dùng]]: nhập **Email đăng nhập**, **Họ tên**, chọn **Vai trò** (Quản trị, Cán bộ nền nếp, Người xem, GVCN).",
        "Với GVCN chọn **Lớp chủ nhiệm** (một GVCN có thể chủ nhiệm nhiều lớp); với vai trò khác chọn **Cấp học được xem** (để trống = tất cả cấp học).",
        "**Mật khẩu (tùy chọn)** – để trống thì sau khi bấm [[Tạo tài khoản]], hệ thống tạo mật khẩu tạm và **chỉ hiển thị một lần**: bấm sao chép và gửi riêng cho người dùng, rồi bấm “Tôi đã lưu, đóng”.",
        "Cần khóa một tài khoản: bấm biểu tượng bút chì (Sửa) ở dòng người dùng, tắt **Tài khoản đang hoạt động** rồi bấm [[Lưu thay đổi]] – người đó không đăng nhập được, phiên đang mở bị đăng xuất.",
      ],
    },
    {
      kind: "list",
      title: "Tạo tài khoản GVCN hàng loạt và đặt lại mật khẩu",
      items: [
        "[[Tạo tài khoản GVCN hàng loạt]] dùng **Email GVCN** trong tab Lớp & GVCN của cấp đang chọn: tạo tài khoản mới cho email chưa có, gán thêm lớp cho tài khoản đã có, bỏ qua lớp chưa có email hoặc email sai. Tích **Đồng bộ (gỡ lớp cũ)** khi đổi GVCN đầu năm để gỡ lớp khỏi người không còn chủ nhiệm.",
        "Kết quả hiện danh sách tài khoản mới kèm mật khẩu tạm (chỉ hiển thị một lần): dùng [[Sao chép tất cả]] hoặc [[Xuất Excel]] để lưu và phân phát, rồi bấm “Tôi đã lưu mật khẩu, đóng”.",
        "Người dùng quên mật khẩu: bấm biểu tượng chìa khóa (Đặt lại mật khẩu) ở dòng của họ rồi xác nhận [[Đặt lại mật khẩu]] – mật khẩu cũ ngừng hoạt động ngay, hệ thống tạo mật khẩu tạm mới và chỉ hiển thị một lần.",
      ],
    },
    {
      kind: "note",
      text: "Quản trị không tự đổi vai trò, cấp học hay khóa tài khoản của chính mình; quản trị toàn trường cuối cùng đang hoạt động không thể bị bỏ quyền hoặc khóa.",
    },
    {
      kind: "list",
      title: "Bảo trì",
      items: [
        "**Tính lại dữ liệu tổng hợp** (nút **Tính lại cho cấp** kèm tên cấp) – dùng khi số liệu có vẻ lệch; người khác vẫn dùng được hệ thống trong lúc tính, nên làm lúc ít người nhập liệu.",
        "**Ảnh minh chứng** – [[Kiểm tra ảnh minh chứng]] để tìm ảnh không gắn với bản ghi nào, rồi xóa vĩnh viễn nếu muốn giải phóng dung lượng (ảnh của bản ghi, kể cả bản ghi đã xóa mềm, được giữ nguyên).",
        "**Vùng nguy hiểm** – xóa dữ liệu thử nghiệm của cả cấp học (chỉ dùng cho dữ liệu thử hoặc khi bắt đầu năm học mới). Hãy lưu **Mã đợt xóa**: có thể [[Khôi phục]] bằng mã này.",
        "**Thông tin hệ thống** – phiên bản dữ liệu, thời điểm tải… dùng khi cần hỗ trợ kỹ thuật.",
      ],
    },
  ],
};

export const QUANTRI_SECTIONS: GuideSection[] = [quanLyHocSinh, duLieu, nhapXuat, nhatKy, caiDat];
