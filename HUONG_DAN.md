# Bot MEC Group – Bản 2 (công ty + cá nhân + ví)

Chạy hoàn toàn bằng Google Apps Script: không dùng AI, không tốn phí, tự chạy sau khi cài.

## Ý tưởng cốt lõi (để hiểu "tiền đi đâu")

- **Một sổ cái duy nhất** (tab `SoCai`). Mọi báo cáo đều tính từ đây.
- Mỗi dòng có **Ví** (Tiền mặt / Ngân hàng / Tiết kiệm) và thuộc một **Dự án**, mỗi dự án thuộc một **Nhóm**:
  - Kinh doanh: SuperMall, Dungo, Chung
  - Gia đình: `GiaDinh`
  - Cá nhân lặt vặt: `CaNhan`
  - Phí thi quỹ: `ThiQuy`
  - Tiền mặt chưa rõ: `ChuaRo`
- **Chuyển giữa các ví không phải chi**: rút ATM (`/rut`), gửi tiết kiệm (`/chuyen`). Nhờ vậy không đếm trùng.
- **Trading không nằm trong sổ cái.** Chỉ ghi phí thi quỹ như một khoản chi: `/chi 1tr ThiQuy nh`.
- Khoản "mất tích" lộ ra bằng `/sodu`: Anh khai số dư thật trong app ngân hàng/ví tiền mặt, bot ghi phần lệch thành "chênh lệch chưa giải thích".

## A. Nâng cấp từ bản 1 (đã cài bản 1)

1. Mở Apps Script, **xóa hết code cũ và dán toàn bộ `Code.gs` mới**. Điền lại `BOT_TOKEN` và `PIN` giống bản 1. Lưu.
2. Chạy hàm **`kiemTra`**: phải thấy các dòng `ok`, không có `FAIL`.
3. Chạy hàm **`setup`**. Lần này nó **nạp lại tab `CauHinh` theo bản 2** (nếu Anh đã tự sửa `CauHinh` ở bản 1, hãy ghi lại trước), thêm cột Ví vào `SoCai` và khối "Số dư các ví" vào `BaoCao`.
4. Vào tab **`CauHinh`**, ô vàng cột **X ("Số dư đầu kỳ")**: nhập **số dư thật hiện tại** của Tiền mặt, Ngân hàng, Tiết kiệm. Chọn menu **MEC Group → Làm mới cấu hình & bảng báo cáo**.
   Bước này bắt buộc làm trước khi ghi giao dịch, nếu không bot sẽ coi số dư đầu là 0.
5. Nếu bản 1 đã ghi dòng thật trong `SoCai`: chọn menu **MEC Group → Gán ví mặc định cho dòng cũ chưa có ví** (dòng thử nên hủy bằng `/undo` hoặc đổi Loại thành `HUY`).
6. **Triển khai → Quản lý triển khai → biểu tượng bút → Phiên bản: Mới → Triển khai.** Không cần chạy lại `thietLapWebhook`.
7. Chạy thử (xem mục C).

## B. Cài mới (chưa cài bản 1)

1. @BotFather → `/newbot` → copy token. Tạo Google Sheet mới → **Tiện ích mở rộng → Apps Script** → dán `Code.gs`, điền `BOT_TOKEN`, `PIN`.
2. Chạy `kiemTra` (phải toàn `ok`), rồi chạy `setup` (cấp quyền).
3. Nhập **số dư đầu kỳ** ở tab `CauHinh` cột X (ô vàng) → menu **MEC Group → Làm mới**.
4. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web** (Thực thi: Tôi; Truy cập: Bất kỳ ai) → chạy `thietLapWebhook` (phải có `"ok":true`).
5. Trên Telegram mở bot → `/dangky MẬT_KHẨU`.

## C. Chạy thử đầu cuối (bắt buộc làm, vì phần Telegram và Sheet chưa ai chạy thật)

```
/vi                        → thấy 3 ví với số dư đầu kỳ vừa nhập
/thu 1tr SuperMall Shopee  → ví Ngân hàng +1.000.000
/rut 500k nh               → Ngân hàng -500.000, Tiền mặt +500.000
/tm 45k CaNhan AnUong      → Tiền mặt -45.000
/chuyen 200k nh tk         → Ngân hàng -200.000, Tiết kiệm +200.000
/tien                      → bảng tiền đi đâu
/doisoat                   → phải ra "SỐ LIỆU KHỚP" (gồm cả số dư ví khớp với bảng BaoCao)
```
Rồi `/undo` 5 lần để hủy các dòng thử.

## D. Dùng hằng ngày

| Việc | Gõ |
|---|---|
| Thu công ty | `/thu 1.2tr SuperMall Shopee` · `/thu 800k Dungo Web` |
| Chi công ty | `/chi 350k SuperMall QC Shopee` · `/chi 1.5tr SuperMall NhapHang #1688 "đợt 2"` |
| Chi gia đình từ ngân hàng | `/chi 2tr GiaDinh DiCho nh` |
| Chi tiền mặt (lặt vặt) | `/tm 45k CaNhan AnUong` · `/tm 80k ChuaRo` (chưa biết là gì) |
| Phí thi quỹ | `/chi 1tr ThiQuy nh` |
| Rút tiền mặt | `/rut 500k nh` (không phải chi) |
| Gửi để dành | `/chuyen 5tr nh tk` (không phải chi) |
| Khai số dư thật | `/sodu nh 12.340.000` · `/sodu tm 0` |
| Xem số dư các ví | `/vi` |
| Tiền đi đâu | `/tien` · `/tien 10/2026` |
| Báo cáo | `/homnay` `/homqua` `/ngay 18/11` `/tuan` `/thang` |
| Sửa / kiểm tra | `/undo` · `/xoa 57` · `/ds 10` · `/doisoat` |

Quy tắc để số luôn chính xác:
- Ví: `tm` (Tiền mặt), `nh` (Ngân hàng), `tk` (Tiết kiệm). Không ghi ví thì dùng ví mặc định (Ngân hàng); `/tm` mặc định Tiền mặt. Bot luôn in ra ví đã dùng và số dư sau khi ghi.
- Số tiền: `350k`, `1.2tr`, `1tr2`, `1.500.000`. Số trần dưới 1.000 (ví dụ `350`) bị từ chối. `m` là triệu.
- Ghi chú đặt trong "ngoặc kép". Thiếu dự án, thiếu danh mục chi hoặc 2 ví trong 1 dòng chi: bot từ chối, không ghi.
- `/undo` và `/xoa` không xóa dòng, chỉ đổi Loại thành `HUY`.
- Mỗi dòng chi tiền mặt phải được ghi. Tiền mặt còn bao nhiêu theo sổ hiện trong `/tien`; nếu ví Tiền mặt âm, bot cảnh báo là có khoản tiêu chưa ghi nguồn tiền.

**Thói quen 1 phút mỗi tuần để biết tiền đi đâu:** mỗi Chủ nhật gõ `/sodu` cho từng ví (số trong app ngân hàng, số tiền mặt đếm được). Dòng "chênh lệch chưa giải thích" trong `/tien` chính là tiền đã tiêu mà chưa ghi.

Bot tự gửi: **20:30** báo cáo ngày; **Chủ nhật** thêm báo cáo tuần và `/tien`; **ngày 1** thêm báo cáo tháng trước.

## E. Nhập trực tiếp trong Google Sheet

Tab `SoCai`: các cột Ngày, Dự án, Kênh, Loại (THU/CHI/CHUYEN), Danh mục, Số tiền, **Ví** (cột M), **Ví đến** (cột N, chỉ khi CHUYEN) đều có danh sách chọn. Dòng CHUYEN để trống Dự án và Danh mục. Sau khi dán nhiều dòng, gõ `/doisoat`.

Tab `BaoCao`: bảng tổng theo dự án × danh mục chi (ô B2 chọn tháng) và khối **Số dư các ví**.

## F. Thêm dự án, ví, danh mục, nhóm, ngưỡng cảnh báo

Sửa tab `CauHinh` (không đặt trùng bí danh giữa Dự án, Kênh, Ví và Danh mục), rồi menu **MEC Group → Làm mới**.
- Thêm ví: điền cột U–X (Ví, Bí danh, Loại Thường/Tiết kiệm, Số dư đầu kỳ). Mở lại tài khoản công ty sau này chỉ cần thêm một ví.
- Đổi nhóm của dự án: cột C.
- Ví mặc định: ô `VI_MAC_DINH` trong cột Thiết lập.

## G. Sự cố thường gặp

- **Bot im lặng**: chạy `xemTrangThaiWebhook`. Nếu `url` trống thì chạy lại `thietLapWebhook`.
- **"Chat chưa đăng ký"**: `/dangky MẬT_KHẨU`.
- **Không nhận báo cáo 20:30**: biểu tượng đồng hồ (Trigger) phải có `baoCaoTuDong`; nếu không thì chạy lại `setup`.
- **`/doisoat` báo LỆCH**: xem danh sách dòng lỗi (sai dự án/danh mục/ví, thiếu ví, ngày hoặc số tiền dạng chữ, Loại viết sai) và sửa trong `SoCai`.
- **Số dư ví lệch lớn ngay từ đầu**: kiểm tra đã nhập số dư đầu kỳ ở cột X chưa.

## H. Chưa có trong bản này

Việc cần làm / chưa làm, tồn đọng, khách hàng và nhân viên cần xử lý, công nợ đối tác, nhập hàng loạt từ báo cáo Shopee/ShipXanh (cần 1 file mẫu).
