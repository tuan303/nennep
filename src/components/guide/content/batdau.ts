/**
 * Hướng dẫn sử dụng – nhóm "Bắt đầu": đăng nhập, giao diện chung, vai trò & quyền, dùng trên điện thoại.
 * Labels are copied from the real screens (dang-nhap/_components, app/shell, settings/lib/users.ts, constants.ts MATRIX).
 * Public repo: fictional examples only (no real names, Mã HS, phones or e-mails).
 */
import type { GuideSection } from "../types";

const dangNhap: GuideSection = {
  id: "dang-nhap",
  title: "Đăng nhập, đổi mật khẩu và đăng xuất",
  icon: "LogIn",
  group: "batdau",
  roles: "all",
  route: "/dang-nhap",
  summary: "Dùng tài khoản do nhà trường cấp để vào phần mềm, tự đổi mật khẩu và đăng xuất an toàn.",
  blocks: [
    {
      kind: "p",
      text: "Phần mềm Nền nếp dùng **tài khoản do nhà trường cấp** (email và mật khẩu). Hệ thống không hỗ trợ tự đăng ký – nếu chưa có tài khoản, thầy/cô liên hệ quản trị viên của trường.",
    },
    {
      kind: "steps",
      title: "Đăng nhập",
      items: [
        "Mở trang [Đăng nhập](/dang-nhap) trên máy tính, máy tính bảng hoặc điện thoại.",
        "Nhập **Email** (dạng `ten@hoangmaistarschool.edu.vn`) và **Mật khẩu**. Bấm biểu tượng con mắt trong ô mật khẩu để hiện hoặc ẩn mật khẩu khi cần kiểm tra lại.",
        "Bấm [[Đăng nhập]]. Khi thấy “Đăng nhập thành công – Đang chuyển vào hệ thống…”, phần mềm tự mở trang làm việc (thường là Tổng quan).",
      ],
    },
    {
      kind: "note",
      title: "Nếu màn hình có thêm nút Google hoặc Microsoft",
      text: "Dưới dòng “hoặc đăng nhập bằng” có thể có nút Google hoặc Microsoft (khi nhà trường bật). Chỉ dùng đúng tài khoản trường đã được cấp quyền.",
    },
    {
      kind: "table",
      caption: "Một số thông báo thường gặp khi đăng nhập",
      head: ["Thông báo", "Cách xử lý"],
      rows: [
        ["Email hoặc mật khẩu không đúng.", "Kiểm tra lại email, tắt Caps Lock (ô mật khẩu sẽ nhắc “Caps Lock đang bật.”) rồi nhập lại."],
        ["Tài khoản tạm khóa do đăng nhập sai nhiều lần, thử lại sau.", "Chờ ít phút rồi thử lại. Nếu đã quên mật khẩu, nhờ quản trị viên đặt lại."],
        ["Tài khoản chưa được cấp quyền", "Đăng nhập đúng nhưng tài khoản chưa được phân quyền trong hệ thống nền nếp. Liên hệ quản trị viên, hoặc bấm [[Đăng nhập bằng tài khoản khác]]."],
        ["Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.", "Tài khoản đang bị khóa – chỉ quản trị viên mở lại được."],
      ],
    },
    {
      kind: "steps",
      title: "Đổi mật khẩu",
      items: [
        "Bấm ảnh đại diện (chữ viết tắt tên) ở góc trên bên phải. Trên điện thoại cũng có thể bấm [[Thêm]] ở thanh menu dưới, mục **Tài khoản**.",
        "Chọn [[Đổi mật khẩu]].",
        "Nhập **Mật khẩu hiện tại**, **Mật khẩu mới** (tối thiểu 8 ký tự, nên gồm cả chữ và số) và **Nhập lại mật khẩu mới**. Có thể tích [[Hiện mật khẩu]] để kiểm tra.",
        "Bấm [[Đổi mật khẩu]]. Lần đăng nhập sau, thầy/cô dùng mật khẩu mới.",
      ],
    },
    {
      kind: "tip",
      title: "Nhận mật khẩu tạm từ quản trị viên?",
      text: "Sau lần đăng nhập đầu bằng mật khẩu tạm, hãy đổi ngay sang mật khẩu của riêng mình theo các bước trên. Đổi mật khẩu chỉ áp dụng cho tài khoản đăng nhập bằng email và mật khẩu – tài khoản đăng nhập bằng Google hoặc Microsoft không có mục [[Đổi mật khẩu]] trong menu tài khoản.",
    },
    {
      kind: "steps",
      title: "Đăng xuất",
      items: [
        "Bấm ảnh đại diện ở góc trên bên phải (trên điện thoại: [[Thêm]] → mục **Tài khoản**).",
        "Chọn [[Đăng xuất]]. Phần mềm quay về màn hình đăng nhập.",
      ],
    },
    {
      kind: "warn",
      title: "Dùng máy tính chung",
      text: "Luôn [[Đăng xuất]] khi dùng máy tính phòng giáo viên hoặc máy mượn. Không lưu mật khẩu trên trình duyệt của máy dùng chung và không gửi mật khẩu qua tin nhắn.",
    },
  ],
};

const giaoDienChung: GuideSection = {
  id: "giao-dien-chung",
  title: "Giao diện chung: cấp học, bộ lọc và menu",
  icon: "LayoutGrid",
  group: "batdau",
  roles: "all",
  summary: "Cách chọn cấp học, đọc màu nhận diện, dùng bộ lọc chung, menu trên máy tính và điện thoại, và trạng thái đồng bộ.",
  blocks: [
    {
      kind: "p",
      text: "Trên máy tính, **thanh menu bên trái** chia chức năng thành các nhóm Tổng quan · Ghi nhận · Điều hành · Quản trị – mỗi người chỉ thấy những trang mình được phép dùng. Bấm [[Thu gọn]] ở cuối thanh để thu nhỏ menu. **Thanh trên cùng** có tên trang, nút chọn cấp học, trạng thái đồng bộ và ảnh đại diện (menu tài khoản); thanh bộ lọc nằm ngay bên dưới (màn hình hẹp hơn dùng nút [[Bộ lọc]] trên thanh trên cùng).",
    },
    {
      kind: "list",
      title: "Chọn cấp học",
      items: [
        "Nút [[Tiểu học]] · [[THCS]] · [[THPT]] ở thanh trên cùng chỉ hiện những cấp tài khoản được xem. Mọi số liệu, danh sách lớp, danh mục lỗi và bộ lọc đều theo **cấp đang chọn**.",
        "Tài khoản chỉ xem một cấp sẽ thấy nhãn cấp cố định thay cho nút chọn. Trên điện thoại, cấp học là một ô chọn nhỏ cạnh logo.",
        "Khi đổi cấp lúc đang nhập dở (sự việc, điểm thưởng, đợt kiểm tra), phần mềm hỏi lại trước – chọn [[Ở lại]] để giữ thông tin đang nhập; nếu đồng ý rời đi, phần chưa lưu sẽ bị bỏ.",
      ],
    },
    {
      kind: "p",
      text: "Mỗi cấp có **màu nhận diện** riêng (đồng bộ với các phần mềm khác của trường): **Tiểu học – vàng**, **THCS – xanh lá**, **THPT – xanh navy**; trang Toàn trường dùng **đỏ NSHM**. Thanh màu đầu trang, nút cấp đang chọn và dòng nhãn cấp phía trên tiêu đề đổi theo màu này để thầy/cô luôn biết mình đang xem cấp nào.",
    },
    { kind: "demo", demo: "level-colors", caption: "Màu nhận diện 3 cấp học và màu Toàn trường." },
    {
      kind: "p",
      text: "**Bộ lọc chung** dùng cho các trang thống kê (Tổng quan, Xếp hạng, Khối & lớp, Báo GVCN, Học sinh, Dữ liệu & rà soát…). Bộ lọc được ghi lên địa chỉ trang, nên tải lại trang hoặc gửi đường dẫn cho đồng nghiệp vẫn giữ nguyên phạm vi đang xem; khi đổi cấp học, các lọc khối, lớp, nhóm lỗi, lỗi và học sinh được bỏ.",
    },
    {
      kind: "table",
      caption: "Các bộ lọc chung",
      head: ["Bộ lọc", "Cách dùng"],
      rows: [
        ["Kỳ báo cáo", "Chọn loại kỳ [[Toàn bộ]] · [[Tuần]] · [[Tháng]] · [[Học kỳ]], rồi chọn kỳ cụ thể, ví dụ “Tuần 12/10 – 18/10/2026”. Kỳ đang diễn ra có nhãn **Hiện tại**; mũi tên ‹ › chuyển nhanh sang kỳ trước/kỳ sau. Mặc định là tuần hiện tại."],
        ["Khối", "“Tất cả khối” hoặc một khối của cấp đang chọn."],
        ["Lớp", "Gõ mã lớp hoặc tên GVCN để tìm nhanh."],
        ["Mảng", "Nhóm nội dung lớn của danh mục lỗi (ví dụ chuyên cần, trang phục…)."],
        ["Nhóm lỗi", "Nhóm mức độ trong danh mục lỗi, ví dụ “Nhóm 1”."],
        ["Lỗi", "Gõ mã lỗi hoặc nội dung lỗi; gõ không dấu cũng tìm được."],
        ["Học sinh", "Gõ Mã HS hoặc họ tên; danh sách theo khối/lớp đang lọc. GVCN chỉ thấy học sinh lớp mình."],
      ],
    },
    { kind: "demo", demo: "filters", caption: "Thanh bộ lọc chung (dữ liệu minh họa)." },
    {
      kind: "tip",
      text: "Bấm [[Xóa lọc]] để trở về mặc định. Trang nào không áp dụng một vài bộ lọc (ví dụ Xếp hạng luôn tính mọi lỗi) sẽ có dòng ghi chú ngay trên trang để thầy/cô biết.",
    },
    {
      kind: "list",
      title: "Trên điện thoại",
      items: [
        "Thanh trên cùng gọn hơn: logo, ô chọn cấp học, nút [[Bộ lọc]] (kèm số bộ lọc đang áp dụng) và ảnh đại diện.",
        "Bấm [[Bộ lọc]] để mở bảng chọn từ dưới lên; chọn xong bấm [[Xem kết quả]], hoặc [[Xóa lọc]] để bỏ tất cả.",
        "Ngay dưới thanh trên cùng là dòng kỳ báo cáo với mũi tên ‹ › và các “viên” bộ lọc đang áp dụng – bấm dấu × trên viên để bỏ nhanh bộ lọc đó.",
        "Thanh menu dưới gồm [[Tổng quan]], [[Xếp hạng]], nút tròn vàng [[Nhập]] ở giữa (với người được nhập sự việc; người khác thấy [[Báo GVCN]] ở vị trí này), [[Học sinh]] và [[Thêm]]. Bấm [[Thêm]] để mở **Tất cả chức năng** – các trang còn lại và mục Tài khoản (Đổi mật khẩu, Đăng xuất).",
        "Bảng nhiều cột tự chuyển thành dạng thẻ dễ đọc trên màn hình nhỏ.",
      ],
    },
    { kind: "demo", demo: "bottom-nav", caption: "Thanh menu dưới trên điện thoại." },
    {
      kind: "table",
      caption: "Trạng thái đồng bộ ở thanh trên cùng (màn hình hẹp chỉ hiện biểu tượng – rê chuột hoặc chạm để xem giải thích)",
      head: ["Trạng thái", "Ý nghĩa"],
      rows: [
        ["Đã đồng bộ", "Dữ liệu là mới nhất và tự cập nhật khi có người khác thêm/sửa. Bấm vào để làm mới ngay."],
        ["Đang cập nhật…", "Đang tải dữ liệu mới nhất của cấp học."],
        ["Chưa đồng bộ", "Lần tải gần nhất bị lỗi. Bấm vào để thử lại."],
        ["Ngoại tuyến", "Mất kết nối mạng. Số liệu đang hiển thị có thể chưa mới nhất; hệ thống tự cập nhật khi có mạng trở lại."],
      ],
    },
    {
      kind: "tip",
      title: "Bấm để xem chi tiết",
      text: "Phần lớn thẻ số liệu, cột biểu đồ, ô bản đồ nhiệt và dòng bảng đều bấm được: để lọc nhanh, mở chi tiết lớp, chi tiết sự việc hoặc lịch sử học sinh. Biểu tượng ⓘ cạnh tên chỉ số cho biết cách tính.",
    },
    {
      kind: "note",
      title: "Mở lại hướng dẫn",
      text: "Trang [Hướng dẫn sử dụng](/huong-dan) luôn mở được: trên máy tính, ở cuối thanh menu bên trái; trên điện thoại, bấm [[Thêm]] rồi chọn ô cuối cùng [[Hướng dẫn sử dụng]]; khi chưa đăng nhập, bấm nút [[Hướng dẫn sử dụng]] ngay dưới khung đăng nhập.",
    },
  ],
};

const vaiTroQuyen: GuideSection = {
  id: "vai-tro-quyen",
  title: "Vai trò & quyền",
  icon: "ShieldCheck",
  group: "batdau",
  roles: "all",
  summary: "Bốn vai trò Quản trị, Cán bộ nền nếp, Người xem và GVCN – mỗi vai trò được xem và làm gì.",
  blocks: [
    {
      kind: "p",
      text: "Mỗi tài khoản có một vai trò, hiện trong menu tài khoản (bấm ảnh đại diện). Menu chỉ hiện những trang vai trò đó được dùng; hệ thống còn kiểm tra quyền ở máy chủ, nên một nút không xuất hiện nghĩa là tài khoản không có quyền đó, không phải lỗi phần mềm.",
    },
    {
      kind: "list",
      title: "Các vai trò",
      items: [
        "**Quản trị** – Toàn quyền: cấu hình, người dùng, nhập/xuất, xóa và khôi phục.",
        "**Cán bộ nền nếp** – Ghi nhận sự việc, điểm thưởng, đợt kiểm tra và biện pháp khắc phục; sửa bản ghi của mình trong 24 giờ.",
        "**Người xem** – Xem số liệu, xếp hạng và báo cáo (Ban Giám hiệu, người theo dõi).",
        "**GVCN** – Xem chi tiết lớp chủ nhiệm, phản hồi và ghi biện pháp khắc phục sự việc của lớp mình, đề xuất điểm thưởng cho lớp.",
      ],
    },
    {
      kind: "table",
      caption: "Ai làm được gì (✓ = được; – = không)",
      head: ["Công việc", "Quản trị", "Cán bộ nền nếp", "Người xem", "GVCN"],
      rows: [
        ["Xem Tổng quan, Xếp hạng, Khối & lớp, Báo GVCN, Báo cáo tuần/tháng, Học sinh", "✓", "✓", "✓", "✓"],
        ["Xem tên học sinh, chi tiết và minh chứng của mọi lớp", "✓", "✓", "✓", "Chỉ lớp chủ nhiệm"],
        ["Toàn trường (so sánh các cấp)", "Khi xem từ 2 cấp", "Khi xem từ 2 cấp", "Khi xem từ 2 cấp", "Khi xem từ 2 cấp"],
        ["Nhập sự việc, ghi đợt kiểm tra", "✓", "✓", "–", "–"],
        ["Ghi điểm thưởng", "✓", "✓", "–", "Đề xuất cho lớp mình"],
        ["Xác nhận điểm thưởng (trạng thái “Đã xác nhận”)", "✓", "–", "–", "–"],
        ["Sửa sự việc, điểm thưởng, đợt kiểm tra", "Mọi bản ghi", "Bản ghi của mình, trong 24 giờ", "–", "–"],
        ["Xóa và khôi phục bản ghi", "✓", "Chỉ xóa đợt kiểm tra của mình, trong 24 giờ", "–", "–"],
        ["Phản hồi của GVCN", "✓", "–", "–", "Lớp mình"],
        ["Biện pháp khắc phục và trạng thái xử lý", "✓", "✓", "–", "Lớp mình"],
        ["Xem Hành động (tóm tắt, cảnh báo sớm, sổ hành động)", "✓", "✓", "✓", "–"],
        ["Tạo và cập nhật hành động", "✓", "–", "–", "–"],
        ["Dữ liệu & rà soát", "✓", "✓", "–", "–"],
        ["Nhập/Xuất Excel, nút Xuất Excel trên các trang", "✓", "–", "–", "–"],
        ["Quản lý học sinh, Cài đặt", "✓", "–", "–", "–"],
        ["Người dùng và Nhật ký", "Quản trị toàn trường", "–", "–", "–"],
      ],
    },
    {
      kind: "note",
      title: "Cấp học được xem",
      text: "Quản trị gán cho mỗi tài khoản các cấp được xem; để trống nghĩa là tất cả cấp học. Cấp của GVCN lấy theo các lớp chủ nhiệm. Quản trị chỉ được giao một vài cấp vẫn cấu hình được cấp của mình, nhưng không quản lý tài khoản và không xem Nhật ký – hai việc này dành cho quản trị toàn trường.",
    },
    {
      kind: "tip",
      title: "GVCN xem lớp khác",
      text: "Với lớp không phải lớp chủ nhiệm, GVCN chỉ thấy số liệu tổng hợp (số sự việc, điểm, xếp hạng); tên học sinh, mô tả chi tiết, phản hồi và minh chứng được ẩn để bảo vệ thông tin học sinh.",
    },
  ],
};

const dienThoai: GuideSection = {
  id: "dien-thoai",
  title: "Mẹo dùng trên điện thoại",
  icon: "Smartphone",
  group: "batdau",
  roles: "all",
  summary: "Thêm phần mềm vào màn hình chính như một ứng dụng, chụp ảnh minh chứng và nhập nhanh hơn trên điện thoại.",
  blocks: [
    {
      kind: "p",
      text: "Phần mềm chạy trực tiếp trên trình duyệt, không cần cài từ kho ứng dụng. Có thể thêm biểu tượng **Nền nếp** ra màn hình chính để mở nhanh, toàn màn hình như một ứng dụng.",
    },
    {
      kind: "steps",
      title: "iPhone, iPad (Safari)",
      items: [
        "Mở trang phần mềm bằng **Safari** và đăng nhập.",
        "Bấm nút **Chia sẻ** (hình vuông có mũi tên lên).",
        "Chọn **Thêm vào MH chính** (tên có thể hơi khác tùy phiên bản iOS), rồi bấm **Thêm**.",
      ],
    },
    {
      kind: "steps",
      title: "Điện thoại Android (Chrome)",
      items: [
        "Mở trang phần mềm bằng **Chrome** và đăng nhập.",
        "Bấm nút menu ⋮ ở góc trên bên phải.",
        "Chọn **Thêm vào màn hình chính** hoặc **Cài đặt ứng dụng**, rồi xác nhận.",
      ],
    },
    {
      kind: "tip",
      text: "Trên một số máy Android, nhấn giữ biểu tượng Nền nếp để mở thẳng **Nhập sự việc** hoặc **Xếp hạng thi đua**.",
    },
    {
      kind: "note",
      text: "Phần mềm vẫn cần mạng để lưu dữ liệu. Khi mất mạng, thanh trên cùng báo **Ngoại tuyến**; hãy chờ có mạng rồi mới bấm lưu.",
    },
    {
      kind: "steps",
      title: "Chụp ảnh minh chứng",
      items: [
        "Ở bước **Minh chứng** của form nhập sự việc (hoặc điểm thưởng), bấm [[Chụp ảnh]] để mở camera, hoặc [[Chọn ảnh]] để lấy ảnh có sẵn trong máy.",
        "Lần đầu, trình duyệt hỏi quyền dùng camera – chọn **Cho phép**.",
        "Ảnh được nén tự động trước khi tải lên; mỗi bản ghi tối đa 5 ảnh (và tối đa 5 liên kết minh chứng).",
        "Chờ hết dòng “Đang tải ảnh minh chứng lên…” rồi mới lưu. Ảnh tải lỗi: bấm **Thử lại** hoặc bỏ ảnh đó – ảnh lỗi không được lưu kèm bản ghi.",
      ],
    },
    {
      kind: "list",
      title: "Nhập nhanh hơn",
      items: [
        "Ô chọn lỗi hiểu chữ không dấu: gõ “muon”, “dong phuc” hoặc mã “L01”. Các lỗi vừa dùng hiện ở nhóm **Dùng gần đây**.",
        "Danh sách học sinh có mục **Hay gặp gần đây** để chọn nhanh.",
        "[[Lưu & nhập tiếp]] giữ nguyên ngày, lớp và phạm vi để ghi sự việc kế tiếp của cùng lớp.",
        "Thanh lưu luôn nằm phía dưới màn hình; nếu chưa lưu được, dòng “Chưa thể lưu: …” cho biết lý do – chạm vào để cuộn tới chỗ cần sửa.",
        "Nếu lỡ chuyển trang khi đang nhập, phần mềm hỏi “Bỏ sự việc đang nhập?”; chọn [[Ở lại]] để tiếp tục.",
      ],
    },
    {
      kind: "warn",
      text: "Không chụp màn hình có tên học sinh để đăng lên mạng xã hội hay nhóm công khai. Báo cáo gửi phụ huynh/GVCN nên dùng chức năng [[Sao chép]] hoặc [[In / Lưu PDF]] trong phần mềm.",
    },
  ],
};

export const BATDAU_SECTIONS: GuideSection[] = [dangNhap, giaoDienChung, vaiTroQuyen, dienThoai];
