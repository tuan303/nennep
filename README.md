# NSHM Nền nếp

Phần mềm theo dõi – chấm điểm – đánh giá nền nếp học sinh **Trường Ngôi Sao Hoàng Mai**
(Tiểu học · THCS · THPT). Web app dùng tốt trên máy tính, máy tính bảng và điện thoại.

## Chức năng chính

| Nhóm | Màn hình |
|---|---|
| Thống kê | **Tổng quan** (KPI, xu hướng, Top 5 vấn đề/lớp/học sinh, bản đồ nhiệt, 5S, tái phạm), **Toàn trường**, **Xếp hạng** (theo khối, đồng hạng 1-2-2-4, Top 90%, RAG), **Khối & lớp** (dòng thời gian), **Báo GVCN** (sao chép/in PDF), **Học sinh** |
| Ghi nhận | **Nhập liệu** (tối ưu điện thoại, chụp ảnh minh chứng, tính điểm tức thì), **Điểm thưởng** (quy trình xác minh) |
| Điều hành | **Hành động**: bản tóm tắt quyết định tự sinh, sổ hành động, quá hạn & leo thang |
| Quản trị | **Quản lý học sinh** (tuyển mới, chuyển đến, chuyển lớp, chuyển trường, import danh sách), **Dữ liệu & rà soát**, **Nhập/Xuất Excel** (tương thích file cũ), **Nhật ký**, **Cài đặt** (cấu hình thi đua, danh mục lỗi, lớp & GVCN, lịch tuần, người dùng) |

Vai trò: **Quản trị**, **Cán bộ nền nếp** (nhập liệu), **Người xem** (BGH), **GVCN** (chỉ xem chi tiết lớp mình, phản hồi sự việc).

## Quy tắc tính điểm (theo đặc tả NSHM)

- Lỗi **/HS**: điểm trừ = mức trừ × số học sinh liên quan · Lỗi **/lần**: điểm trừ = mức trừ × số lần.
- Lỗi /HS phạm vi Tập thể chưa rõ tên học sinh: nhập **số HS** → vẫn tính điểm, gắn cờ *Thiếu tên HS* để rà soát.
- **Điểm thi đua = Điểm nền (100 × số tuần được tính) + Điểm thưởng (đã xác nhận) − Điểm trừ**.
- Xếp hạng riêng từng khối, đồng hạng kiểu 1, 2, 2, 4; **Top 90%** = hạng ≤ ⌈90% × số lớp⌉ (đồng hạng tại ngưỡng đều thuộc Top 90%).
- RAG: Vàng ≥ 10, Đỏ ≥ 25 điểm trừ/tuần (chỉ áp dụng khi BGH đã phê duyệt; thiếu dữ liệu → Xám).

## Kỹ thuật

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Firebase Auth + Firestore · Vercel.
Tài liệu: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (thiết kế), [docs/SERVER_API.md](docs/SERVER_API.md),
[docs/FRONTEND_API.md](docs/FRONTEND_API.md), **[docs/HUONG_DAN_TRIEN_KHAI.md](docs/HUONG_DAN_TRIEN_KHAI.md)** (triển khai).

```bash
npm run typecheck
```
```bash
npm test
```

> Thư mục `data/` chứa dữ liệu học sinh thật dùng để chạy thử – **không** đưa lên GitHub (đã có trong `.gitignore`).
