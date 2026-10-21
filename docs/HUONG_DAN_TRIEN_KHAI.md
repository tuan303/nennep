# Hướng dẫn triển khai – NSHM Nền nếp

Phần mềm chạy trên **Vercel** (giao diện + API) và **Firebase** (đăng nhập + cơ sở dữ liệu Firestore).
Dự án Firebase của trường: **`nennep-8ac2f`** (Firestore vùng `asia-southeast1` – Singapore).

> Khuyến nghị gói Firebase **Blaze** kèm **cảnh báo ngân sách** (Google Cloud → Billing → Budgets & alerts, ví dụ 5 USD/tháng):
> phần mềm không dùng Cloud Functions hay Cloud Storage nên chi phí thực tế rất nhỏ, nhưng gói Spark (miễn phí) có hạn mức
> cứng – 50.000 lượt đọc/ngày, 20.000 lượt ghi/ngày, 1 GiB dữ liệu – mà nhiều tab mở cùng lúc (mỗi lần ghi, các tab tải lại
> dữ liệu), nhật ký đăng nhập sai và ảnh minh chứng có thể chạm tới; khi chạm hạn mức, phần mềm ngừng hoạt động đến hết ngày.
> Ảnh minh chứng được nén trên điện thoại (≈ 200 KB/ảnh, khổ 1280 px; tối đa 700 KB) rồi lưu trong Firestore.

---

## 1. Chuẩn bị Firebase (một lần)

1. **Authentication → Sign-in method** → bật **Email/Password**. *(đã làm)*
   **Authentication → Settings → User actions** → **bỏ chọn “Enable create (sign-up)”**: không ai tự đăng ký được tài khoản.
   Khi bật đăng nhập Google/Microsoft, người dùng cũng phải được Quản trị tạo tài khoản trong phần mềm trước.
2. **Firestore Database** → tạo ở **production mode**, vùng **asia-southeast1**. *(đã làm)*
3. **Project settings → Service accounts → Generate new private key** → tải file JSON.
   File này là **chìa khóa toàn quyền** vào dữ liệu: không gửi qua chat/email, không đưa lên GitHub.
4. Khuyến nghị: Firestore → (default) → **Settings** → bật **Delete protection**.
5. Triển khai **quy tắc bảo mật** và **chỉ mục** (chạy trong thư mục dự án):

   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes --project nennep-8ac2f --account <email-tài-khoản-Firebase>
   ```

   - Quy tắc: trình duyệt **không** đọc/ghi trực tiếp dữ liệu học sinh; mọi truy cập đi qua API có kiểm tra quyền.
     Trình duyệt chỉ được đọc tài liệu `meta/versions` (bộ đếm phiên bản, không chứa dữ liệu cá nhân) để tự cập nhật,
     và chỉ khi tài khoản đã được cấp quyền và đang hoạt động trong phần mềm.
   - Chỉ mục: cần cho Nhật ký và danh sách bản ghi đã xóa (Firestore mất vài phút để xây chỉ mục).

## 2. Biến môi trường

| Biến | Bắt buộc | Giá trị |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ✔ | từ cấu hình web app (đã có trong `.env.production.local`) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ✔ | `nennep-8ac2f.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ✔ | `nennep-8ac2f` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ✔ | `1:701611886729:web:…` |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | ✔ (bí mật) | nội dung file JSON khóa dịch vụ, mã hóa base64 (xem dưới) |
| `BOOTSTRAP_ADMIN_EMAILS` | tùy chọn – nên để trống | email tự động thành Quản trị ở lần đăng nhập đầu. Chỉ có tác dụng khi email **đã xác minh** (Google/Microsoft, hoặc Email/Password đã xác minh) và **chưa có Quản trị nào đang hoạt động**. Nên dùng `npm run create-admin` (mục 3) thay cho biến này. |
| `NEXT_PUBLIC_AUTH_GOOGLE` / `NEXT_PUBLIC_AUTH_MICROSOFT` | tùy chọn | `true` để hiện nút đăng nhập Google/Microsoft (người dùng vẫn phải được Admin cấp quyền) |

Tạo chuỗi base64 từ file khóa dịch vụ (macOS):

```bash
base64 -i ~/Downloads/nennep-8ac2f-firebase-adminsdk.json | tr -d '\n' | pbcopy
```

(lệnh chép chuỗi vào clipboard để dán vào Vercel; thay đường dẫn file cho đúng.)

Thay thế: dùng 3 biến `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (lấy từ file JSON; giữ nguyên các ký tự `\n` trong khóa).

## 3. Tạo tài khoản Quản trị đầu tiên

Điền khóa dịch vụ vào `.env.production.local` (biến `FIREBASE_SERVICE_ACCOUNT_BASE64`), rồi chạy:

```bash
npm run create-admin -- <email-quản-trị> "Họ tên" --env .env.production.local
```

**Không ghi mật khẩu trên dòng lệnh** (mật khẩu sẽ nằm lại trong lịch sử lệnh): công cụ hỏi mật khẩu với ký tự ẩn
(bấm Enter để tự tạo mật khẩu tạm, hiện một lần), hoặc lấy từ biến môi trường `ADMIN_PASSWORD` nếu có.
Lệnh kiểu cũ có mật khẩu (`<email> "<mật khẩu>" "<Họ tên>"`) bị từ chối.

> Nếu tài khoản Quản trị thật đang dùng mật khẩu mẫu từng ghi trong tài liệu này (bản trước), hãy **đổi mật khẩu ngay**
> (đăng nhập → đổi mật khẩu, hoặc chạy lại lệnh trên để đặt mật khẩu mới – mọi phiên cũ bị đăng xuất).

Sau đó đăng nhập phần mềm và tạo các tài khoản khác tại **Cài đặt → Người dùng**
(có nút **Tạo tài khoản GVCN hàng loạt** dùng email GVCN trong danh mục lớp; tùy chọn **Đồng bộ** gỡ lớp cũ khỏi GVCN đã đổi lớp).

- Chỉ **Quản trị toàn trường** (để trống “Cấp học được xem”) mới quản lý tài khoản và xem Nhật ký; Quản trị giới hạn cấp học
  vẫn cài đặt, nhập/xuất, bảo trì cho cấp của mình. Phải luôn còn ít nhất một Quản trị toàn trường đang hoạt động.
- Email đã có tài khoản đăng nhập (ví dụ ai đó tự đăng ký trước) được **bảo vệ lại** khi tạo trong phần mềm: cấp mật khẩu tạm mới,
  gỡ phương thức đăng nhập khác và đăng xuất mọi phiên cũ (trừ tài khoản Google/Microsoft đã xác minh của chính email đó).

## 4. Đưa lên Vercel

1. Tạo project trên Vercel, nguồn là thư mục `nshm-nennep` (framework: **Next.js**, Node ≥ 20).
2. **Settings → Environment Variables**: thêm các biến ở mục 2 cho môi trường **Production** (và Preview nếu dùng).
   Biến `NEXT_PUBLIC_*` được "đóng gói" lúc build → phải thêm **trước** khi build.
3. Deploy. Vùng chạy hàm khuyến nghị: **Singapore (sin1)** cho gần Firestore (Settings → Functions → Region).
   Phần mềm dùng **Next.js 15.5.28 / React 19.1.10** (bản vá lỗ hổng React Server Components). Trước mỗi lần deploy chạy
   `npm audit --omit=dev`. Nếu từng có bản build Next.js 15.5.4 chạy công khai, hãy **tạo khóa dịch vụ Firebase mới**
   (xóa khóa cũ trong Service accounts, cập nhật `FIREBASE_SERVICE_ACCOUNT_BASE64` trên Vercel) và xem lại log Vercel / Firestore.
4. (Tùy chọn) gắn tên miền riêng, ví dụ `nennep.hoangmaistarschool.edu.vn`, và thêm tên miền đó vào
   Firebase **Authentication → Settings → Authorized domains** nếu bật đăng nhập Google/Microsoft.

## 5. Nạp dữ liệu ban đầu

Đăng nhập bằng tài khoản Quản trị → **Nhập/Xuất Excel**:

1. Chọn cấp học (Tiểu học / THCS / THPT) ở thanh trên cùng.
2. Tải lên file Excel của cấp đó (định dạng cũ hoặc file xuất từ phần mềm).
3. Lần đầu: tích cả **Cấu hình** để lấy mốc học kỳ; bấm **Kiểm tra trước** → xem các dòng Lỗi/Cảnh báo.
4. **Xác nhận nhập**. Dòng *Lỗi* không được nhập; dòng *Cảnh báo* được nhập ở trạng thái **Cần rà soát**
   (xem tại **Dữ liệu & rà soát**). Nhập lại cùng file **không** tạo bản ghi trùng.
5. Vào **Cài đặt → Cấu hình thi đua**: kiểm tra mốc học kỳ, ngưỡng RAG (Vàng 10 / Đỏ 25 điểm trừ/tuần) và bật
   **Phê duyệt ngưỡng cảnh báo** khi BGH đã duyệt (trước đó trạng thái lớp hiển thị Xám theo đặc tả).

## 6. Vận hành & sao lưu

- **Sao lưu**: Firestore → *Import/Export* (cần gói Blaze) hoặc định kỳ **Xuất workbook Excel** từng cấp tại Nhập/Xuất.
- **Nhật ký**: mọi đăng nhập, tạo/sửa/xóa, import/export đều được ghi (Cài đặt không thể xóa nhật ký).
- **Xóa** là xóa mềm: khôi phục tại **Dữ liệu & rà soát → Đã xóa**.
- **Chuyển năm học**: cập nhật Cấu hình (năm học, mốc HK) → Lịch tuần → *Tạo lại từ cấu hình*; dữ liệu năm cũ vẫn được giữ.
  Khi các tuần cũ còn sự việc / điểm thưởng, phần mềm hỏi xác nhận (**“Vẫn lưu và ẩn các bản ghi này”**): bản ghi năm cũ không còn
  hiện trong thống kê nhưng không bị xóa. Sự việc / điểm thưởng chỉ ghi được vào ngày thuộc lịch tuần.
- **Chuyển cấp** (lớp 5 → lớp 6, lớp 9 → lớp 10): Quản lý học sinh → “⋯” → *Chuyển cấp (giữ Mã HS)*, hoặc import danh sách
  của cấp mới (dòng “Chuyển cấp”). Cần quyền ở cả hai cấp.
- **Khóa tài khoản** trong phần mềm (Cài đặt → Người dùng), **không** chỉ khóa trong Firebase console (khóa ở console không chặn
  phiên đang mở, phần mềm cũng không ghi nhật ký việc đó).
  Đặt lại mật khẩu hoặc khóa tài khoản sẽ đăng xuất mọi phiên đang mở của người đó.
- **Ảnh minh chứng**: định kỳ vào Cài đặt → Bảo trì → *Ảnh minh chứng* → Kiểm tra → xóa ảnh của các biểu mẫu bị bỏ dở
  (không gắn với bản ghi nào sau 48 giờ).
- Chỉ chạy *Import*, *Tính lại dữ liệu tổng hợp*, *Xóa dữ liệu thử nghiệm* khi ít người đang nhập liệu.

### Sau khi cập nhật bản 10/2026 (một lần)

1. Cài đặt → Bảo trì → **Tính lại dữ liệu tổng hợp** cho **từng cấp** (chuyển điểm thưởng sang bản tổng hợp theo tháng).
2. Triển khai lại quy tắc bảo mật: `npx firebase deploy --only firestore:rules,firestore:indexes …` (mục 1).
3. Trên Vercel: để trống `BOOTSTRAP_ADMIN_EMAILS` (mục 2); kiểm tra Firebase Auth đã tắt tự đăng ký (mục 1).

## 7. Chạy thử trên máy (không cần Firebase thật)

```bash
npm install
```
```bash
npm run emulators
```
(cần Java 21; mở terminal khác cho các lệnh sau)
```bash
npm run seed
```
```bash
npm run dev
```

Mở http://localhost:3000 – tài khoản thử (mật khẩu `Nshm@2026`): `admin@nshm.test`, `bgh@nshm.test`,
`nennep@nshm.test`, `nennep.thcs@nshm.test`, `gvcn.6a01@nshm.test`, `gvcn.1a1@nshm.test`, `gvcn.12l01@nshm.test`.
