# NSHM Nền nếp

Phần mềm theo dõi – chấm điểm – đánh giá nền nếp học sinh **Trường Ngôi Sao Hoàng Mai**
(Tiểu học · THCS · THPT). Web app dùng tốt trên máy tính, máy tính bảng và điện thoại.

## Chức năng chính

| Nhóm | Màn hình |
|---|---|
| Thống kê | **Tổng quan** (KPI: sự việc, lượt vi phạm, số HS vi phạm, điểm trừ/thưởng; xu hướng, theo nhóm lỗi, điểm trừ cộng dồn, cảnh báo sớm, Top 5 vấn đề/lớp/học sinh, bản đồ nhiệt, 5S, tái phạm), **Toàn trường**, **Xếp hạng** (theo khối, đồng hạng 1-2-2-4 – THPT: một bảng toàn cấp, bằng điểm xét lượt vi phạm, Top 3; Top 90%, RAG, biến động xếp hạng, bao phủ kiểm tra), **Khối & lớp** (dòng thời gian, điểm trừ cộng dồn), **Báo GVCN** (sao chép/in PDF, biện pháp khắc phục), **Báo cáo tuần/tháng** (gửi BGH / tổ khối / GVCN, in – lưu PDF, Excel chi tiết), **Học sinh** |
| Ghi nhận | **Nhập liệu** (tối ưu điện thoại, chụp ảnh minh chứng, tính điểm tức thì, cảnh báo có thể trùng; tab **Đợt kiểm tra**), **Điểm thưởng** (+1…+5, lý do bắt buộc, GVCN đề xuất, quy trình xác minh) |
| Điều hành | **Hành động**: bản tóm tắt quyết định tự sinh, sổ hành động, quá hạn & leo thang, **cảnh báo sớm** (tái phạm, tăng lỗi, lỗi kéo dài, sự việc nghiêm trọng) |
| Quản trị | **Quản lý học sinh** (tuyển mới, chuyển đến, chuyển lớp, chuyển trường, import danh sách), **Dữ liệu & rà soát** (có thể trùng, kiểm tra công thức & dữ liệu), **Nhập/Xuất Excel** (tương thích file cũ), **Nhật ký**, **Cài đặt** (cấu hình thi đua, danh mục lỗi, lớp & GVCN, lịch tuần, ngưỡng cảnh báo sớm, người dùng) |

Bộ lọc chung: tuần / tháng / học kỳ, khối, lớp, mảng, lỗi, **nhóm lỗi**, **học sinh** (theo quyền).

Vai trò: **Quản trị**, **Cán bộ nền nếp** (nhập liệu, đợt kiểm tra, biện pháp khắc phục), **Người xem** (BGH), **GVCN** (chỉ xem chi tiết lớp mình, phản hồi sự việc và biện pháp khắc phục, đề xuất điểm thưởng cho lớp mình).

## Quy tắc tính điểm (theo đặc tả NSHM)

- Lỗi **/HS**: điểm trừ = mức trừ × số học sinh liên quan · Lỗi **/lần**: điểm trừ = mức trừ × số lần.
- Lỗi /HS phạm vi Tập thể chưa rõ tên học sinh: nhập **số HS** → vẫn tính điểm, gắn cờ *Thiếu tên HS* để rà soát.
- **Điểm thi đua = Điểm nền (100 × số tuần được tính) + Điểm thưởng (đã xác nhận) − Điểm trừ**.
- Điểm thưởng mới: số nguyên **1–5**, lý do ≥ 5 ký tự (điểm cũ ngoài thang vẫn giữ nguyên). Đề xuất của GVCN chỉ được tính khi ở trạng thái được tính thi đua.
- Sự việc có thể trùng (cùng ngày, lớp, lỗi và học sinh) được cảnh báo, không chặn lưu; người rà soát đánh dấu "Không trùng" hoặc xóa bản trùng.
- Tiểu học, THCS: xếp hạng riêng từng khối, đồng hạng kiểu 1, 2, 2, 4.
- **THPT: xếp hạng chung toàn cấp** (không chia khối): bằng điểm thì lớp **ít lượt vi phạm hơn** xếp trên; bằng cả điểm và lượt vi phạm (ví dụ các lớp nguyên 100 điểm, không bị trừ lỗi nào) thì đồng hạng (1, 1, 3…); báo cáo nêu **Top 3 toàn cấp** (gồm cả lớp đồng hạng ở vị trí thứ 3).
- **Top 90%** = hạng ≤ ⌈90% × số lớp của khối – THPT: số lớp toàn cấp⌉ (đồng hạng tại ngưỡng đều thuộc Top 90%).
- RAG: Vàng ≥ 10, Đỏ ≥ 25 điểm trừ/tuần (chỉ áp dụng khi BGH đã phê duyệt; thiếu dữ liệu → Xám).

## Kỹ thuật

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Firebase Auth + Firestore · Vercel.
Tài liệu: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (thiết kế), [docs/SERVER_API.md](docs/SERVER_API.md),
[docs/FRONTEND_API.md](docs/FRONTEND_API.md), **[docs/HUONG_DAN_TRIEN_KHAI.md](docs/HUONG_DAN_TRIEN_KHAI.md)** (triển khai).

Hướng dẫn sử dụng cho người dùng: trang **`/huong-dan`** trong phần mềm (đọc được cả khi chưa đăng nhập; mở từ nút
*Hướng dẫn sử dụng* dưới khung đăng nhập hoặc mục cuối menu; in / lưu PDF được). Nội dung nằm ở `src/components/guide/content/`.

```bash
npm run typecheck
```
```bash
npm test
```

> Thư mục `data/` chứa dữ liệu học sinh thật dùng để chạy thử – **không** đưa lên GitHub (đã có trong `.gitignore`).
