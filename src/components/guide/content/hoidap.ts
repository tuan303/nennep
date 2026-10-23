/**
 * Hướng dẫn sử dụng – nhóm "Câu hỏi thường gặp": mục hỗ trợ, câu hỏi thường gặp và thuật ngữ.
 * Every answer was checked against the real screens; fictional examples only.
 */
import type { GuideContent, GuideSection } from "../types";

const hoTro: GuideSection = {
  id: "ho-tro",
  title: "Khi gặp sự cố hoặc cần hỗ trợ",
  icon: "MessageCircleQuestionMark",
  group: "hoidap",
  roles: "all",
  summary: "Các bước tự kiểm tra nhanh và thông tin cần gửi kèm khi nhờ quản trị viên hỗ trợ.",
  blocks: [
    {
      kind: "steps",
      title: "Tự kiểm tra nhanh",
      items: [
        "Xem trạng thái đồng bộ ở thanh trên cùng: **Ngoại tuyến** – kiểm tra mạng; **Chưa đồng bộ** – bấm vào để thử lại; **Đã đồng bộ** – bấm vào để làm mới ngay.",
        "Kiểm tra **cấp học** và **bộ lọc** đang chọn (kỳ, khối, lớp…): nhiều trường hợp “không thấy dữ liệu” là do đang lọc kỳ khác hoặc cấp khác. Bấm [[Xóa lọc]] để thử lại.",
        "Tải lại trang (hoặc đóng và mở lại ứng dụng trên điện thoại).",
        "Đăng xuất rồi đăng nhập lại nếu phần mềm báo phiên đăng nhập hết hạn.",
      ],
    },
    {
      kind: "list",
      title: "Khi nhờ quản trị viên, hãy gửi kèm",
      items: [
        "Mã bản ghi liên quan: sự việc `NN-…`, điểm thưởng `KT-…`, đợt kiểm tra `DKT-…`, hành động `HD-…`.",
        "Trang đang dùng, cấp học, kỳ đang chọn và thời điểm xảy ra.",
        "Nội dung thông báo lỗi trên màn hình (chép lại chữ, không cần ảnh có tên học sinh).",
      ],
    },
    {
      kind: "note",
      text: "Quản trị có thể tra lại thao tác ở [Nhật ký](/nhat-ky) và xem **Thông tin hệ thống** ở Cài đặt → Bảo trì khi cần hỗ trợ kỹ thuật.",
    },
    {
      kind: "warn",
      text: "Không gửi mật khẩu qua tin nhắn hay email. Quản trị viên không cần mật khẩu của thầy/cô để hỗ trợ – khi cần sẽ đặt lại mật khẩu tạm.",
    },
  ],
};

export const HOIDAP_SECTIONS: GuideSection[] = [hoTro];

export const FAQ: GuideContent["faq"] = [
  {
    q: "Tôi quên mật khẩu thì làm thế nào?",
    a: "Phần mềm không có chức năng tự lấy lại mật khẩu. Thầy/cô liên hệ quản trị viên: quản trị vào Cài đặt → [[Người dùng]] → [[Đặt lại mật khẩu]] để tạo mật khẩu tạm. Đăng nhập bằng mật khẩu tạm rồi đổi ngay qua menu tài khoản → [[Đổi mật khẩu]].",
    sectionId: "dang-nhap",
  },
  {
    q: "Đăng nhập báo “Tài khoản tạm khóa do đăng nhập sai nhiều lần”?",
    a: "Do nhập sai mật khẩu nhiều lần liên tiếp. Chờ ít phút rồi thử lại, nhớ tắt Caps Lock. Nếu không nhớ mật khẩu, nhờ quản trị viên đặt lại thay vì thử tiếp.",
    sectionId: "dang-nhap",
  },
  {
    q: "Vì sao tôi không thấy lớp (hoặc cấp học) của mình?",
    a: "Kiểm tra lần lượt: (1) cấp học đang chọn ở thanh trên cùng; (2) bộ lọc **Khối** đang chọn khối khác; (3) với GVCN – lớp chủ nhiệm do quản trị gán trong Cài đặt → Người dùng → **Lớp chủ nhiệm** (nếu chưa gán, trang Báo GVCN báo “Chưa được gán lớp chủ nhiệm”); (4) lớp đã bị tắt **Lớp đang hoạt động**. Trường hợp (3) và (4) cần quản trị viên xử lý.",
    sectionId: "vai-tro-quyen",
  },
  {
    q: "Tôi ghi nhầm sự việc, sửa thế nào?",
    a: "Trong 24 giờ kể từ khi ghi, mở [Nhập liệu](/nhap-lieu), tìm sự việc ở khung **Ghi nhận gần đây** và bấm [[Sửa]] (hoặc mở chi tiết sự việc → [[Sửa]]), chỉnh rồi bấm [[Cập nhật]]. Quá 24 giờ, hoặc sự việc do người khác ghi, hãy báo Quản trị kèm mã sự việc `NN-…`.",
    sectionId: "nhap-lieu",
  },
  {
    q: "Xóa nhầm sự việc hoặc điểm thưởng có lấy lại được không?",
    a: "Được. Xóa trong phần mềm là **xóa mềm** – bản ghi chỉ bị ẩn khỏi thống kê. Quản trị mở [Dữ liệu & rà soát](/du-lieu?tab=da-xoa) → tab [[Đã xóa]], tìm bản ghi và bấm [[Khôi phục]]. (Riêng đợt kiểm tra đã xóa thì không khôi phục được.)",
    sectionId: "du-lieu",
  },
  {
    q: "Vì sao lớp hiển thị màu Xám?",
    a: "Xám là “Chưa đủ dữ liệu”, do một trong hai lý do: ngưỡng cảnh báo **chưa được phê duyệt** (khi đó mọi lớp đều Xám – Quản trị phê duyệt trong Cài đặt → Cấu hình thi đua), hoặc **độ tin cậy dữ liệu** của lớp thấp hơn mức tối thiểu vì còn nhiều sự việc Cần rà soát. Rê chuột hoặc chạm vào nhãn Xám để xem lý do cụ thể.",
    sectionId: "quy-tac-rag",
  },
  {
    q: "Vì sao điểm trừ đang là 0 khi chưa chọn học sinh?",
    a: "Lỗi tính theo học sinh (/HS) có điểm = mức trừ × số học sinh, nên khi chưa có học sinh thì điểm bằng 0. Trên form nhập liệu, phần mềm sẽ không cho lưu cho đến khi thầy/cô chọn tên học sinh hoặc (với phạm vi Tập thể) nhập **Số HS chưa rõ tên**. Sự việc cũ nhập từ Excel bị thiếu học sinh nằm ở tab [[Cần rà soát]] – bấm [[Bổ sung học sinh]] để tính lại điểm.",
    sectionId: "quy-tac-diem-tru",
  },
  {
    q: "Học sinh chuyển trường thì dữ liệu cũ ra sao?",
    a: "Quản trị vào [Quản lý học sinh](/quan-ly-hoc-sinh) → thao tác **Chuyển trường đi / Tốt nghiệp**. Học sinh không còn trong danh sách chọn khi nhập sự việc mới, nhưng lịch sử vi phạm và điểm trừ cũ của lớp vẫn được giữ nguyên. Nếu em quay lại trường, dùng **Khôi phục (đang học)**.",
    sectionId: "quan-ly-hoc-sinh",
  },
  {
    q: "Đồng nghiệp vừa nhập mà tôi chưa thấy, số liệu không cập nhật?",
    a: "Dữ liệu thường tự cập nhật sau vài giây khi trạng thái là **Đã đồng bộ**; có thể bấm vào đó để làm mới ngay. Nếu thấy **Chưa đồng bộ** hoặc **Ngoại tuyến**, kiểm tra mạng rồi bấm thử lại hoặc tải lại trang. Cũng kiểm tra kỳ đang lọc – sự việc ghi cho ngày thuộc tuần khác sẽ không hiện trong tuần đang xem.",
    sectionId: "giao-dien-chung",
  },
  {
    q: "In hoặc lưu PDF trên iPad, iPhone thế nào?",
    a: "Dùng Safari, bấm [[In / Lưu PDF]] (hoặc [[In]]) để mở **Tùy chọn in**. Muốn in: chọn máy in (AirPrint). Muốn lưu PDF: bấm nút **Chia sẻ** ở phía trên màn hình tùy chọn in rồi chọn **Lưu vào Tệp** (hoặc gửi thẳng qua ứng dụng khác); nếu không thấy nút Chia sẻ, dùng hai ngón tay phóng to ảnh xem trước để mở bản PDF rồi bấm Chia sẻ. Bảng rộng hiển thị đẹp nhất khi in từ máy tính.",
    sectionId: "bao-cao",
  },
  {
    q: "Vì sao điểm thưởng (hoặc đề xuất của GVCN) chưa được cộng vào điểm thi đua?",
    a: "Chỉ điểm thưởng ở trạng thái được tính (mặc định **Đã xác nhận**) mới được cộng. Với cấu hình mặc định, khoản Mới ghi nhận hoặc Đang xác minh chờ Quản trị kiểm tra minh chứng và bấm [[Xác nhận]]. Riêng đề xuất của GVCN luôn chỉ được cộng sau khi được chuyển sang **Đã xác nhận**.",
    sectionId: "diem-thuong",
  },
  {
    q: "Tôi lọc theo một lỗi nhưng bảng xếp hạng không đổi?",
    a: "Đúng như thiết kế: điểm thi đua luôn tính mọi lỗi nên bộ lọc mảng, nhóm lỗi, lỗi và học sinh không áp dụng cho xếp hạng. Bộ lọc lớp chỉ làm nổi bật lớp đó; thứ hạng vẫn tính trên toàn bộ lớp của khối (THPT: của cả cấp, nên lọc khối cũng không thu hẹp bảng).",
    sectionId: "xep-hang",
  },
  {
    q: "Ở THPT, vì sao hai lớp cùng điểm thi đua lại khác hạng?",
    a: "Cấp THPT xếp hạng chung toàn cấp (không chia khối). Khi bằng điểm, lớp có **ít lượt vi phạm hơn** xếp trên; chỉ khi bằng cả điểm và lượt vi phạm (ví dụ các lớp giữ nguyên điểm nền, không bị trừ lỗi nào) mới đồng hạng. Cột **Lượt vi phạm** trên bảng xếp hạng cho biết lý do.",
    sectionId: "quy-tac-thi-dua",
  },
  {
    q: "Phần mềm báo “Có thể trùng sự việc đã ghi” khi lưu?",
    a: "Đã có sự việc cùng ngày, cùng lớp, cùng lỗi và có chung học sinh (hoặc cả hai đều không ghi tên học sinh). Bấm [[Xem]] cạnh sự việc trong hộp thoại để xem lại. Nếu đây là sự việc khác, chọn [[Không trùng, vẫn lưu]]; nếu đồng nghiệp đã ghi rồi, chọn [[Hủy]] để lớp không bị trừ điểm hai lần.",
    sectionId: "nhap-lieu",
  },
  {
    q: "Vì sao không chọn được ngày khi nhập sự việc?",
    a: "Không ghi được sự việc ở ngày trong tương lai, và ngày phải thuộc lịch tuần của năm học. Nếu ngày hợp lệ mà vẫn báo lỗi, nhờ Quản trị kiểm tra Cài đặt → [[Lịch tuần]].",
    sectionId: "nhap-lieu",
  },
  {
    q: "Tôi là GVCN, sao không thấy tên học sinh của lớp khác?",
    a: "Để bảo vệ thông tin học sinh, GVCN chỉ xem chi tiết (tên học sinh, mô tả, phản hồi, minh chứng) của lớp chủ nhiệm. Với lớp khác, thầy/cô vẫn thấy số liệu tổng hợp và xếp hạng.",
    sectionId: "vai-tro-quyen",
  },
  {
    q: "Tuần nghỉ lễ có bị tính điểm nền không?",
    a: "Không, nếu Quản trị đã tắt **Tính thi đua** cho tuần đó trong Cài đặt → [[Lịch tuần]]. Khi đó không lớp nào được cộng điểm nền của tuần nghỉ, nên xếp hạng vẫn công bằng.",
    sectionId: "quy-tac-thi-dua",
  },
  {
    q: "Có cài phần mềm như ứng dụng trên điện thoại được không?",
    a: "Được. Mở phần mềm bằng Safari (iPhone/iPad) hoặc Chrome (Android) rồi chọn **Thêm vào màn hình chính** – biểu tượng Nền nếp sẽ mở toàn màn hình như ứng dụng. Phần mềm vẫn cần mạng để lưu dữ liệu.",
    sectionId: "dien-thoai",
  },
  {
    q: "Lỡ chuyển trang hoặc đổi cấp học khi đang nhập dở có mất dữ liệu không?",
    a: "Khi bấm sang trang khác hoặc đổi cấp học, phần mềm hỏi “Bỏ sự việc đang nhập?” – chọn [[Ở lại]] để giữ thông tin và nhập tiếp; nếu chọn [[Bỏ và rời trang]] thì phần chưa lưu bị bỏ. Nếu lỡ rời trang mà không có câu hỏi này (ví dụ nút quay lại của trình duyệt), thông tin vẫn được giữ trong thẻ trình duyệt đó và tự khôi phục khi mở lại form (thông báo “Đã khôi phục sự việc đang nhập dở”). Tải lại trang hoặc đóng thẻ thì không giữ được.",
    sectionId: "nhap-lieu",
  },
];

export const GLOSSARY: GuideContent["glossary"] = [
  { term: "Sự việc", definition: "Một lần ghi nhận nền nếp, có mã dạng `NN-yyyymmdd-NNNN`; có thể liên quan một hay nhiều học sinh hoặc cả tập thể lớp." },
  { term: "Lượt vi phạm", definition: "Lỗi /HS: mỗi học sinh liên quan là 1 lượt (kể cả HS chưa rõ tên); lỗi /lần: mỗi lần vi phạm là 1 lượt." },
  { term: "Số HS vi phạm", definition: "Số học sinh khác nhau được ghi tên trong các sự việc; mỗi em chỉ đếm 1 lần, không gồm HS chưa rõ tên." },
  { term: "HS liên quan", definition: "Tổng lượt học sinh liên quan của các sự việc, gồm cả HS chưa rõ tên; một em có 2 sự việc được đếm 2 lần." },
  { term: "HS chưa rõ tên", definition: "Số học sinh vi phạm chưa xác định được tên (chỉ dùng cho lỗi /HS, phạm vi Tập thể); vẫn tính điểm, sự việc mang nhãn Thiếu tên HS." },
  { term: "Mức trừ", definition: "Số điểm trừ của một lỗi trong bảng điểm lỗi, tính cho mỗi học sinh (/HS) hoặc mỗi lần (/lần)." },
  { term: "/HS", definition: "Đơn vị tính theo học sinh: điểm trừ = mức trừ × số học sinh liên quan." },
  { term: "/lần", definition: "Đơn vị tính theo lần: điểm trừ = mức trừ × số lần vi phạm, không nhân theo số học sinh." },
  { term: "Phạm vi (Cá nhân / Tập thể)", definition: "Cá nhân: vi phạm của từng học sinh, bắt buộc có tên. Tập thể: vi phạm của nhiều học sinh hoặc của lớp." },
  { term: "Mảng", definition: "Nhóm nội dung lớn của danh mục lỗi; dùng để lọc và thống kê, và để chọn mảng cho đợt kiểm tra." },
  { term: "Nhóm lỗi", definition: "Phân nhóm lỗi trong danh mục (ví dụ “Nhóm 1”); một số nhóm có thể được đặt là nghiêm trọng trong cảnh báo sớm." },
  { term: "5S", definition: "Nhãn đánh dấu các lỗi thuộc nội dung theo dõi 5S trong danh mục lỗi; được thống kê riêng ở thẻ Theo dõi 5S." },
  { term: "Điểm nền", definition: "Điểm mỗi lớp được cộng cho mỗi tuần tính thi đua (mặc định 100 điểm/tuần)." },
  { term: "Tuần tính thi đua", definition: "Tuần được bật “Tính thi đua” trong Lịch tuần và đã bắt đầu; tuần nghỉ lễ, tuần thi có thể được tắt." },
  { term: "Điểm thưởng", definition: "Điểm cộng cho tập thể lớp (+1 đến +5, kèm lý do), mã dạng `KT-…`; chỉ cộng vào thi đua khi ở trạng thái được tính." },
  { term: "Điểm thi đua", definition: "Điểm nền + Điểm thưởng được tính − Điểm trừ; dùng để xếp hạng các lớp trong khối (THPT: trong toàn cấp)." },
  { term: "Xếp hạng 1-2-2-4", definition: "Cách xếp hạng đồng điểm đồng hạng: hai lớp cùng hạng 2 thì lớp kế tiếp hạng 4. THPT chỉ đồng hạng khi bằng cả điểm và lượt vi phạm." },
  { term: "Xếp hạng toàn cấp", definition: "Quy định riêng của THPT: mọi lớp khối 10–12 xếp chung một bảng; bằng điểm thì lớp ít lượt vi phạm hơn xếp trên; báo cáo nêu Top 3 toàn cấp (gồm cả lớp đồng hạng)." },
  { term: "Top 90%", definition: "Nhóm lớp có hạng không vượt quá ngưỡng = làm tròn lên 90% số lớp của khối (THPT: số lớp toàn cấp); tỷ lệ do Quản trị cấu hình." },
  { term: "RAG", definition: "Mức cảnh báo của lớp theo điểm trừ trung bình mỗi tuần: Xanh – Ổn định, Vàng – Cần chú ý, Đỏ – Cần can thiệp, Xám – Chưa đủ dữ liệu." },
  { term: "Phê duyệt ngưỡng", definition: "Bước Quản trị xác nhận ngưỡng Vàng/Đỏ đã được BGH thông qua; trước khi phê duyệt mọi lớp hiển thị Xám." },
  { term: "Độ tin cậy dữ liệu", definition: "(Số sự việc Hợp lệ + Thiếu tên HS) ÷ tổng số sự việc; thấp hơn mức tối thiểu thì lớp hiển thị Xám." },
  { term: "Kiểm tra dữ liệu", definition: "Nhãn của mỗi sự việc: Hợp lệ, Thiếu tên HS (vẫn tính điểm) hoặc Cần rà soát (thiếu dữ liệu hay lệch quy định)." },
  { term: "Có thể trùng", definition: "Các sự việc cùng ngày, cùng lớp, cùng lỗi và có chung học sinh (hoặc cùng không ghi tên học sinh) – có thể là ghi trùng làm điểm trừ bị tính hai lần." },
  { term: "Đợt kiểm tra", definition: "Một lần kiểm tra nền nếp ghi lại ngày, buổi, mảng và các lớp được kiểm tra, mã dạng `DKT-…`; không tính điểm." },
  { term: "Bao phủ kiểm tra", definition: "Mức độ mỗi lớp được kiểm tra so với trung bình khối; lớp có số đợt dưới 60% trung bình của khối (mặc định) bị đánh dấu Ít được kiểm tra." },
  { term: "Cảnh báo đỏ", definition: "Học sinh có từ 3 lượt vi phạm trở lên trong cùng một tuần (mặc định)." },
  { term: "Tái phạm", definition: "Học sinh có từ 2 lượt vi phạm trở lên trong vòng 4 tuần (mặc định); với lớp: điểm trừ tuần từ ngưỡng Vàng trở lên trong ít nhất 2 tuần tính thi đua liên tiếp." },
  { term: "Cảnh báo sớm", definition: "Danh sách tự động gồm Tái phạm, Tăng lỗi, Lỗi kéo dài và Sự việc nghiêm trọng, giúp can thiệp trước khi tình hình xấu đi." },
  { term: "Hành động", definition: "Việc cải thiện nền nếp được giao người phụ trách và hạn xử lý, mã dạng `HD-…`; trạng thái Mới mở, Đang thực hiện, Hoàn thành." },
  { term: "Leo thang", definition: "Hành động quá hạn lâu hơn thời hạn của mức ưu tiên – cần báo cáo BGH để thống nhất lại hạn hoặc người phụ trách." },
  { term: "Biện pháp khắc phục", definition: "Cách xử lý đã áp dụng với học sinh/lớp sau sự việc, do GVCN của lớp, cán bộ nền nếp hoặc Quản trị ghi." },
  { term: "Phản hồi GVCN", definition: "Ý kiến của giáo viên chủ nhiệm về một sự việc của lớp mình, hiện trong Báo GVCN và chi tiết sự việc." },
  { term: "Xóa mềm", definition: "Bản ghi bị ẩn khỏi thống kê nhưng vẫn được lưu kèm người xóa và lý do; Quản trị khôi phục được." },
  { term: "Workbook", definition: "File Excel xuất toàn bộ dữ liệu của một cấp học (nhập liệu, học sinh, danh mục, xếp hạng…); có thể chỉnh rồi nhập lại." },
  { term: "Bản chụp HTML", definition: "Báo cáo một trang mở được không cần mạng, dùng để lưu trữ/chia sẻ; không dùng để nhập lại." },
  { term: "Sĩ số nguồn", definition: "Sĩ số lớp theo danh sách của trường (khai ở Lớp & GVCN), dùng để so với số học sinh đang học trong phần mềm." },
];
