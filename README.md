# MEC Group bot

Bot quản lý thu chi + ví (Google Sheet + Telegram) viết bằng Google Apps Script.
Xem `HUONG_DAN.md`. BOT_TOKEN và PIN lưu ở Script Properties (menu MEC Group trong Sheet), không nằm trong code.

## Tự động đẩy code vào Apps Script (clasp + GitHub Actions)

Mỗi lần push lên `main` có thay đổi `Code.gs`, workflow `.github/workflows/deploy.yml` chạy `clasp push`.
Cần 2 secret trong GitHub (Settings → Secrets and variables → Actions):
- `CLASPRC_JSON`: nội dung file `~/.clasprc.json` sau khi chạy `clasp login` trên máy.
- `DEPLOYMENT_ID` (không bắt buộc): ID bản triển khai Web app, để Telegram chạy code mới ngay.
Cũng cần bật Apps Script API tại https://script.google.com/home/usersettings.
