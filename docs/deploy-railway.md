# Deploy OC Studio lên Railway (dùng một mình)

Mục tiêu: mở OC Studio bằng điện thoại kể cả khi máy tính tắt. Kiến trúc giữ nguyên như khi chạy local:

| Thành phần       | Trên Railway                                       | Ghi chú                                                       |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Ứng dụng Next.js | 1 service chạy liên tục (`pnpm start:prod`)        | **Chỉ 1 replica**, không bật Serverless/ngủ                   |
| Database         | Service PostgreSQL của Railway                     | Migration tự chạy mỗi lần khởi động                           |
| Ảnh tải lên      | 1 Volume gắn vào service ứng dụng (`/app/storage`) | Ảnh ngoài Volume sẽ **mất** sau mỗi lần deploy                |
| Đăng nhập        | `APP_PASSWORD` + `AUTH_SECRET`                     | Thiếu một trong hai → app từ chối mọi request (503)           |
| Tác vụ AI        | Chạy nền trong RAM của service                     | Restart/redeploy sẽ hủy tác vụ đang chạy (bản nháp không mất) |

> Quy ước trong tài liệu này: lệnh **PowerShell** chạy trên máy Windows của bạn. Mỗi lệnh ghi rõ
> “📁 Đứng ở …” — mở PowerShell rồi `cd` vào thư mục đó trước khi chạy.
> Chữ trong `<ngoặc nhọn>` là chỗ bạn thay bằng giá trị thật.

---

## 0. Chuẩn bị

1. Code đã được đẩy lên GitHub (repo private là được) và nhánh chứa phần deploy đã merge vào `main`.
2. Có tài khoản Railway (<https://railway.com>) và đã cho Railway quyền đọc repo GitHub.
3. Cài Railway CLI (chỉ cần cho bước đưa ảnh cũ lên Volume):

   📁 Đứng ở: thư mục bất kỳ

   ```powershell
   npm install -g @railway/cli
   railway login
   ```

4. Tạo sẵn hai giá trị bí mật và lưu vào trình quản lý mật khẩu:
   - `APP_PASSWORD`: mật khẩu bạn sẽ gõ khi đăng nhập (đủ dài, không dùng lại mật khẩu khác).
   - `AUTH_SECRET`: chuỗi ngẫu nhiên ≥ 32 ký tự để ký cookie. Tạo bằng:

     📁 Đứng ở: thư mục bất kỳ

     ```powershell
     node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
     ```

---

## 1. Tạo project và PostgreSQL

1. Railway → **New Project** → **Deploy PostgreSQL** (hoặc tạo **Empty Project** rồi **+ Create → Database → PostgreSQL**).
2. Đợi service `Postgres` chạy (chấm xanh). Chưa thêm ứng dụng vội nếu bạn định đưa dữ liệu cũ lên (bước 2) — đưa dữ liệu vào database còn trống là đơn giản nhất.

## 2. (Tùy chọn) Đưa database local lên Railway

Bỏ qua bước này nếu bạn muốn bắt đầu với database trống.

### 2.1 Dump database local

Trên Windows, công cụ PostgreSQL không có trong PATH; dùng đường dẫn đầy đủ tới thư mục `bin` của
bản cài PostgreSQL 17 (thường là `C:\Program Files\PostgreSQL\17\bin\`; máy bạn có thể là
`D:\PostgreSQL17\bin\`). Lưu bản dump **ngoài thư mục dự án** để không lỡ commit nó.

📁 Đứng ở: `D:\Backups` (tạo thư mục này nếu chưa có: `mkdir D:\Backups`)

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -h localhost -d oc_studio -F c -f "oc_studio_$(Get-Date -Format yyyyMMdd_HHmmss).dump"
```

Lệnh hỏi mật khẩu PostgreSQL local. Bản dump gồm cả bảng `drizzle.__drizzle_migrations`, nên khi
ứng dụng khởi động trên Railway nó biết các migration đã áp dụng và không tạo lại bảng.

### 2.2 Lấy URL kết nối công khai của Postgres trên Railway

Service **Postgres** → tab **Variables** → copy giá trị **`DATABASE_PUBLIC_URL`** (dạng
`postgresql://postgres:...@<host>.proxy.rlwy.net:<port>/railway`). Đây là bí mật — không dán vào
chat/issue. (`DATABASE_URL` thường chỉ dùng được bên trong mạng riêng của Railway.)

Kiểm tra phiên bản server (nên ≥ 17, bằng hoặc mới hơn bản local):

📁 Đứng ở: thư mục bất kỳ

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" "<DATABASE_PUBLIC_URL>" -c "select version();"
```

### 2.3 Restore lên Railway

📁 Đứng ở: `D:\Backups`

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --no-owner --no-privileges -d "<DATABASE_PUBLIC_URL>" "oc_studio_<thời_điểm>.dump"
```

- `--no-owner --no-privileges`: user trên Railway khác user local, bỏ qua quyền sở hữu là đúng.
- Nếu bạn **đã lỡ deploy ứng dụng trước** (nó đã tạo bảng trống) và database Railway **chưa có dữ
  liệu thật**, thêm `--clean --if-exists` vào lệnh trên để xóa các bảng trống đó trước khi restore.
  Không dùng hai cờ này khi database Railway đã có dữ liệu bạn muốn giữ.

Kiểm tra nhanh:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" "<DATABASE_PUBLIC_URL>" -c "select count(*) from characters;"
```

## 3. Thêm service ứng dụng từ GitHub

1. Trong project: **+ Create → GitHub Repo** → chọn repo OC Studio.
2. Railway tự nhận diện Node.js + pnpm (theo `packageManager` và `engines` trong `package.json`).
   Lần build đầu có thể thất bại/không chạy được vì chưa có biến môi trường — bình thường, làm tiếp
   bước 4–6 rồi deploy lại.

## 4. Biến môi trường (service ứng dụng → tab **Variables**)

| Biến                    | Giá trị                              | Bắt buộc | Ghi chú                                                            |
| ----------------------- | ------------------------------------ | -------- | ------------------------------------------------------------------ |
| `DATABASE_URL`          | `${{Postgres.DATABASE_URL}}`         | ✔        | Gõ đúng như vậy — Railway tự nối tới service Postgres (mạng riêng) |
| `APP_PASSWORD`          | mật khẩu đăng nhập của bạn           | ✔        | Khoảng trắng đầu/cuối bị bỏ qua                                    |
| `AUTH_SECRET`           | chuỗi ngẫu nhiên ≥ 32 ký tự (bước 0) | ✔        | Đổi giá trị này = đăng xuất mọi thiết bị                           |
| `MEDIA_STORAGE_DIR`     | `/app/storage`                       | ✔        | Phải trùng **Mount path** của Volume (bước 5)                      |
| `GEMINI_API_KEY`        | API key Gemini                       |          | Không có thì phần AI báo “Chưa cấu hình”                           |
| `GEMINI_MODEL`          | ví dụ `gemini-3.8-flash`             |          | Như `.env.example`                                                 |
| `GEMINI_ALLOWED_MODELS` | danh sách model, cách nhau dấu phẩy  |          | Như `.env.example`                                                 |
| `AI_REQUEST_TIMEOUT_MS` | ví dụ `300000`                       |          | Mặc định 5 phút                                                    |

**Không** đặt `PORT` (Railway tự cấp, `next start` tự đọc) và không cần đặt `NODE_ENV`.

Thiếu `APP_PASSWORD` hoặc `AUTH_SECRET`, hay `AUTH_SECRET` ngắn hơn 32 ký tự: mọi trang trả về lỗi
503 kèm thông báo “OC Studio chưa cấu hình đăng nhập…”. Đó là cố ý (fail-closed) — sửa biến rồi
deploy lại.

## 5. Gắn Volume cho thư mục ảnh

1. Trên canvas của project: chuột phải (hoặc `Ctrl+K`) → **Create Volume** → chọn service ứng dụng.
2. **Mount path**: `/app/storage` (Railway đặt code ứng dụng ở `/app`; mount ở đây khớp với thư mục
   mặc định `storage/` và với `MEDIA_STORAGE_DIR` ở bước 4).
3. Volume chỉ được gắn khi container chạy (không có lúc build/pre-deploy) — vì vậy kiểm tra thư mục
   ảnh nằm trong Start Command (bước 6), không phải Pre-deploy.

Khi khởi động, `scripts/check-storage.mjs` tự tạo thư mục nếu chưa có và thử ghi một tệp:

- Không ghi được → log `✖ Không ghi được vào thư mục ảnh … (EACCES)` và app **không** khởi động.
  Lỗi quyền (`EACCES`/`EPERM`) trên Volume: thêm biến `RAILWAY_RUN_UID=0` cho service rồi deploy lại.
- Thư mục ảnh không nằm trên Volume → log cảnh báo `⚠ … KHÔNG nằm trên Railway Volume` (app vẫn chạy
  nhưng ảnh sẽ mất khi deploy lại — sửa ngay).

## 6. Cài đặt service ứng dụng (tab **Settings**)

| Mục                                | Giá trị                 | Vì sao                                                                  |
| ---------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| Build → Build Command              | `pnpm build` (mặc định) |                                                                         |
| Deploy → **Start Command**         | `pnpm start:prod`       | Kiểm tra thư mục ảnh → chạy migration → `next start`                    |
| Deploy → Pre-deploy Command        | để trống                | Migration đã nằm trong Start Command (cần Volume + chạy mỗi lần)        |
| Deploy → **Replicas**              | **1**                   | Tác vụ AI và bộ đếm đăng nhập sai nằm trong RAM của một tiến trình      |
| Deploy → Serverless / App Sleeping | **tắt**                 | Ngủ = mất tác vụ AI đang chạy; app cần chạy liên tục                    |
| Deploy → Healthcheck Path          | `/login`                | Trang duy nhất trả 200 khi chưa đăng nhập (`/api/health` đòi đăng nhập) |
| Deploy → Restart Policy            | On Failure              |                                                                         |
| Networking → Public Networking     | **Generate Domain**     | Nhận URL `https://<tên>.up.railway.app`                                 |

`pnpm start:prod` = `node scripts/check-storage.mjs && node scripts/migrate.mjs && next start`.
`scripts/migrate.mjs` dùng migrator của `drizzle-orm` (không cần `drizzle-kit`, `tsx` hay
`.env.local`), dùng chung bảng `drizzle.__drizzle_migrations` với `pnpm db:migrate`, nên an toàn khi
chạy lại mỗi lần khởi động. Migration lỗi → app không khởi động (xem log).

Sau khi chỉnh xong: **Deploy** (hoặc nút **Redeploy** trên deployment mới nhất).

## 7. Kiểm tra sau khi deploy

Tab **Deployments → View Logs** phải có lần lượt:

```text
✔ Thư mục ảnh: /app/storage
→ Chạy migration trên <host>/railway…
✔ Database đã ở phiên bản schema mới nhất.
▲ Next.js 16.x
✓ Ready in …
```

Rồi mở domain ở bước 6 trên điện thoại:

1. Bị chuyển tới `/login` → nhập `APP_PASSWORD` → vào trang Tổng quan.
2. Trang Tổng quan báo PostgreSQL “đã kết nối”, số nhân vật đúng với dữ liệu đã restore.
3. Tải thử một ảnh đại diện → **Redeploy** → ảnh vẫn còn (chứng tỏ Volume hoạt động).
4. Nút **Đăng xuất** ở cuối thanh bên → quay lại `/login`.

Đăng nhập sai 5 lần từ một nơi (hoặc 25 lần tổng cộng) trong 15 phút sẽ bị khóa tạm tới hết 15 phút
đó. Phiên đăng nhập có hạn 30 ngày.

## 8. (Tùy chọn) Đưa ảnh cũ trong `storage/` lên Volume

Ảnh local nằm ở `D:\OC Studio\storage\media\<năm>\<tháng>\<uuid>.<đuôi>`; database chỉ lưu khóa
`media/<năm>/<tháng>/…`. Volume mount ở `/app/storage`, nên trong Volume các tệp phải nằm ở
`/media/<năm>/<tháng>/…` (đường dẫn tính từ gốc Volume). Chỉ đưa thư mục `media` lên — **không**
đưa `storage/e2e-test` (dữ liệu test).

📁 Đứng ở: `D:\OC Studio`

```powershell
railway link                                     # chọn project, environment và service ứng dụng
railway volume files upload .\storage\media /media
railway volume files list /media                 # kiểm tra: phải thấy các thư mục năm
```

Nếu CLI hỏi chọn Volume thì chọn Volume đã gắn ở bước 5. Lệnh `railway volume browse /` mở giao
diện dạng cây để xem/tải lên/tải xuống từng tệp nếu cần. Làm bước này **sau** khi đã restore
database (bước 2): ảnh chỉ hiện khi có dòng tương ứng trong bảng `media_assets`.

## 9. Vận hành hằng ngày

- **Cập nhật code:** push lên `main` → Railway tự build và deploy lại; migration mới tự chạy khi
  khởi động. Trước khi merge một migration mới, sao lưu database (mục dưới). Mỗi lần deploy có vài
  giây gián đoạn và các tác vụ AI đang chạy sẽ bị hủy.
- **Sao lưu database Railway** về máy:

  📁 Đứng ở: `D:\Backups`

  ```powershell
  & "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -F c -d "<DATABASE_PUBLIC_URL>" -f "railway_$(Get-Date -Format yyyyMMdd_HHmmss).dump"
  ```

- **Sao lưu ảnh** về máy:

  📁 Đứng ở: `D:\Backups`

  ```powershell
  railway volume files list /media
  railway volume browse /media                    # chọn thư mục rồi tải xuống trong giao diện
  ```

  (Lệnh `railway` cần chạy trong thư mục đã `railway link`, hoặc thêm `-p/-s/-e` để chỉ rõ project,
  service, environment.)

- **Đổi mật khẩu:** sửa `APP_PASSWORD` trong Variables → deploy lại. Mọi thiết bị bị đăng xuất.
- **Nghi lộ cookie/thiết bị bị mất:** đổi `AUTH_SECRET` → deploy lại.
- Không tăng Replicas, không bật Serverless/App Sleeping (xem bảng ở bước 6).
