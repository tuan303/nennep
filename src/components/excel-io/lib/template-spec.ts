/**
 * Expected workbook layout shown in the "Mẫu file" card (the sheets/columns written by exportLevelWorkbook and read
 * back by parseNshmWorkbook). Pure data – a test checks it against a real export.
 */
export interface TemplateSheet {
  name: string;
  purpose: string;
  /** Main columns (header text as written in the export). */
  columns: string[];
  /** Short tip for people editing the sheet by hand. */
  tip?: string;
}

export const TEMPLATE_SHEETS: readonly TemplateSheet[] = [
  {
    name: "Nhập liệu",
    purpose: "Mỗi dòng là một sự việc nền nếp.",
    columns: ["Mã sự việc", "Ngày", "Lớp", "Chọn lỗi (nội dung)", "Số lần vi phạm", "Số HS liên quan", "Phạm vi", "Người ghi", "Minh chứng", "Trạng thái", "Nội dung chi tiết", "Kiểm tra dữ liệu", "Số HS không rõ tên"],
    tip: "“Chọn lỗi” kết thúc bằng mã lỗi, ví dụ “… | L04”. Để trống Mã sự việc nếu là dòng mới.",
  },
  {
    name: "HS liên quan",
    purpose: "Học sinh của từng sự việc (một dòng một học sinh).",
    columns: ["Mã sự việc", "Lớp sự việc", "Họ và tên", "Mã HS", "Lớp HS", "Ghi chú"],
    tip: "Ưu tiên ghi Mã HS; nếu chỉ có họ tên, hệ thống tìm theo tên trong lớp của sự việc.",
  },
  {
    name: "DS Học sinh",
    purpose: "Danh sách học sinh theo lớp.",
    columns: ["Mã HS", "Họ và tên", "Ngày sinh", "Lớp", "Khối", "Trạng thái"],
  },
  {
    name: "Danh mục",
    purpose: "Lớp, GVCN và thông tin liên hệ.",
    columns: ["Lớp", "Khối", "Hệ", "GVCN", "Phó CN", "SĐT GVCN", "Mail GVCN", "Sĩ số nguồn"],
  },
  {
    name: "Bảng điểm lỗi",
    purpose: "Danh mục lỗi và mức trừ.",
    columns: ["Mã lỗi", "Mảng", "Nội dung lỗi", "Nhóm lỗi", "Mức trừ", "Đơn vị"],
    tip: "Đơn vị là “/HS” (nhân số học sinh) hoặc “/lần” (nhân số lần).",
  },
  {
    name: "Cấu hình",
    purpose: "Điểm nền mỗi tuần, tuần bắt đầu và ngày học kỳ.",
    columns: ["Tham số", "Giá trị", "Ghi chú"],
    tip: "Chỉ được nhập khi chọn “Cấu hình” – sẽ ghi đè cấu hình đã phê duyệt.",
  },
  {
    name: "Lịch tuần",
    purpose: "Các tuần học trong năm học.",
    columns: ["Tuần bắt đầu", "Tuần kết thúc", "Tháng", "Học kỳ", "Tính thi đua"],
  },
  {
    name: "Điểm thưởng",
    purpose: "Điểm thưởng của tập thể lớp.",
    columns: ["Mã thưởng", "Ngày", "Lớp", "Nội dung", "Điểm", "Người ghi", "Minh chứng", "Ghi chú", "Trạng thái"],
  },
];
