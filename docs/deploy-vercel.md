# Deploy OC Studio lên Vercel + Neon + Vercel Blob (miễn phí, dùng một mình)

Kết quả: OC Studio chạy trên Vercel (gói **Hobby**, miễn phí), mở được bằng điện thoại khi máy tính tắt,
có mật khẩu bảo vệ. Dữ liệu nằm ở **Neon Postgres** (gói Free), ảnh nằm ở **Vercel Blob** (store
**Private** — không ai xem được ảnh nếu chưa đăng nhập).

> **Quy ước lệnh:** mọi lệnh terminal dưới đây chạy trong **PowerShell** trên Windows, và mỗi lệnh ghi
> rõ phải đứng ở thư mục nào. Đường dẫn dự án giả định là `D:\OC Studio` — nếu bạn để chỗ khác thì
> thay cho đúng. Chỗ nào viết `<…>` là phần bạn tự điền (bỏ luôn dấu `<` `>`).

## Ứng dụng chạy thế nào trên Vercel

| Thành phần        | Trên máy (`pnpm dev`)  | Trên Vercel                                               |
| ----------------- | ---------------------- | --------------------------------------------------------- |
| Database          | PostgreSQL local       | Neon (`DATABASE_URL` = chuỗi _pooled_)                    |
| Migration         | `pnpm db:migrate`      | Tự chạy lúc build (`pnpm vercel-build`, chuỗi _unpooled_) |
| Ảnh               | Thư mục `storage/`     | Vercel Blob private; trình duyệt tải ảnh thẳng lên Blob   |
| Tác vụ AI         | Bảng `ai_section_jobs` | Như local; chạy nền bằng `after()`, tối đa 300 giây       |
| Đếm đăng nhập sai | Bảng `login_failures`  | Như local                                                 |

Vercel là _serverless_: không có ổ đĩa lâu dài, mỗi request có thể chạy ở một máy khác. Vì vậy mọi
trạng thái (tác vụ AI, đếm đăng nhập sai) nằm trong Postgres, ảnh nằm trong Blob.

## Giới hạn gói miễn phí (kiểm tra lại ở trang giá khi deploy — số liệu có thể đổi)

**Vercel Blob (Hobby):** 1 GB lưu trữ; 10.000 _simple operations_ (đọc ảnh khi cache CDN không có
sẵn), 2.000 _advanced operations_ (mỗi lần **tải ảnh lên** = 1; **mở trình duyệt file Blob trong
dashboard cũng tính**); 10 GB truyền tải mỗi tháng.
Khi vượt: **không mất tiền**, nhưng **Blob bị khóa cho tới khi đủ 30 ngày** — trong thời gian đó ảnh
không hiện và không tải ảnh mới được (phần chữ của app vẫn dùng bình thường). Vercel gửi email khi
sắp chạm giới hạn.
→ Ảnh tối đa 8 MB/ảnh, nên 1 GB là vài trăm ảnh lớn. Nén ảnh trước khi tải lên nếu được. Trình duyệt
giữ ảnh đã xem 1 năm nên xem lại không tốn thêm lượt đọc.

**Neon (Free):** theo trang [Neon plans](https://neon.com/docs/introduction/plans) lúc viết tài liệu
này: **1 GB** dữ liệu mỗi project (trước đây là 0,5 GB — xem lại con số hiện tại), 100 CU-giờ tính toán
mỗi tháng, 5 GB truyền tải mỗi tháng. Database tự "ngủ" sau 5 phút không dùng; lần mở đầu tiên sau
đó chậm hơn vài giây.
Khi vượt dung lượng: mọi thao tác **ghi** (lưu, sửa, xóa) bị từ chối cho tới khi bạn giải phóng chỗ
hoặc nâng cấp. Khi vượt giờ tính toán/truyền tải: database bị tạm dừng tới kỳ tháng sau. Neon **không
xóa dữ liệu** của bạn. OC Studio chủ yếu là chữ nên rất khó chạm giới hạn này.

**Vercel Functions (Hobby):** mỗi request chạy tối đa **300 giây**; body request/response tối đa
**4,5 MB** (vì vậy ảnh được tải thẳng từ trình duyệt lên Blob, và ảnh được trả về dạng stream).
Gói Hobby chỉ dành cho mục đích cá nhân, phi thương mại — đúng với cách dùng này.

---

## Bước 0 — Chuẩn bị trên máy

1. Code đã nằm trên GitHub (nhánh `main`).
2. Kiểm tra mọi thứ chạy được. Đứng ở `D:\OC Studio`:

   ```powershell
   pnpm install
   pnpm db:migrate
   pnpm build
   ```

3. Tạo mật khẩu đăng nhập (`APP_PASSWORD`, bạn tự đặt — dài, khó đoán) và khóa ký phiên
   `AUTH_SECRET` (chuỗi ngẫu nhiên ≥ 32 ký tự). Đứng ở thư mục nào cũng được:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Lưu cả hai vào trình quản lý mật khẩu. Đổi một trong hai về sau = đăng xuất mọi thiết bị.

## Bước 1 — Import repo vào Vercel

1. Vào [vercel.com](https://vercel.com), đăng nhập bằng GitHub (tạo tài khoản **Hobby** nếu chưa có).
2. **Add New… → Project** → chọn repo OC Studio → **Import**.
3. Ở màn hình cấu hình:
   - **Framework Preset:** Next.js (tự nhận).
   - **Build Command:** để mặc định — file `vercel.json` trong repo đã đặt `pnpm vercel-build`
     (chạy migration rồi `next build`).
   - Mở **Environment Variables** và thêm:

     | Tên                     | Giá trị                                       |
     | ----------------------- | --------------------------------------------- |
     | `APP_PASSWORD`          | mật khẩu ở Bước 0                             |
     | `AUTH_SECRET`           | chuỗi ngẫu nhiên ở Bước 0                     |
     | `AI_PROVIDER`           | `gemini`                                      |
     | `GEMINI_API_KEY`        | key Gemini của bạn (nếu dùng AI)              |
     | `GEMINI_MODEL`          | ví dụ `gemini-3.8-flash` (giống `.env.local`) |
     | `GEMINI_ALLOWED_MODELS` | giống `.env.local`                            |
     | `AI_REQUEST_TIMEOUT_MS` | để trống (mặc định 240000); tối đa 280000     |

     **Không** thêm `MEDIA_STORAGE_DIR` trên Vercel.

4. Bấm **Deploy**. Lần deploy đầu **sẽ lỗi** ở bước migration với thông báo
   “Chưa có DATABASE_URL_UNPOOLED / DATABASE_URL” — bình thường, vì chưa có database. Làm tiếp
   Bước 2.

## Bước 2 — Tạo Neon Postgres

1. Trong project trên Vercel: tab **Storage → Create Database** → chọn **Neon** (Marketplace,
   “Serverless Postgres”) → **Continue**.
2. Chọn gói **Free**. **Region:** nên chọn gần bạn và trùng region của Vercel Functions — ví dụ
   **Singapore (`aws-ap-southeast-1`)**, rồi ở Bước 6 đặt Functions về `sin1`. (Hoặc để cả hai ở
   Washington D.C. / `iad1` mặc định.)
3. Đặt tên (ví dụ `oc-studio`) → **Create**.
4. Khi được hỏi kết nối với project: chọn project OC Studio, môi trường **Production** (và
   **Development** nếu muốn). **Bỏ chọn Preview** — bản preview của nhánh khác không bao giờ được
   đụng database thật (script migration cũng tự bỏ qua môi trường preview).
5. Vào **Settings → Environment Variables** của project, kiểm tra đã có **`DATABASE_URL`** (chuỗi
   _pooled_, host có chữ `-pooler`) và **`DATABASE_URL_UNPOOLED`** (chuỗi trực tiếp). Nếu tích hợp
   đặt tên khác (ví dụ có tiền tố), thêm hai biến đúng tên này với giá trị tương ứng — copy ở trang
   store Neon → tab **.env.local** → **Show secret**.

## Bước 3 — Tạo Vercel Blob (Private)

1. Tab **Storage → Create Database** (hoặc **Create Storage**) → chọn **Blob** → **Continue**.
2. **Access: Private** (bắt buộc — ảnh OC không được lộ ra ngoài). Đặt tên, ví dụ `oc-images`, chọn
   region gần Neon → **Create**.
3. Kết nối với project OC Studio, môi trường **Production** (bỏ Preview và Development — nếu
   Development có `BLOB_READ_WRITE_TOKEN`, `vercel env pull` sẽ kéo nó về máy và `pnpm dev` sẽ ghi ảnh
   vào Blob thật).
4. Kiểm tra **Settings → Environment Variables** có **`BLOB_READ_WRITE_TOKEN`** (app cần token này để
   cấp quyền tải ảnh lên trực tiếp). Có thể có thêm `BLOB_STORE_ID` — để nguyên.

## Bước 4 — Chuyển dữ liệu từ PostgreSQL trên máy lên Neon (nếu muốn giữ dữ liệu cũ)

Làm bước này **trước khi deploy lại** (Bước 6), khi database Neon còn trống. Sao lưu được tạo ra là
một file — giữ nó lại như bản backup.

1. Lấy chuỗi kết nối **trực tiếp** (unpooled) của Neon: Vercel → **Storage** → store Neon → tab
   **.env.local** → **Show secret** → copy giá trị `DATABASE_URL_UNPOOLED`
   (dạng `postgresql://…@ep-…​.neon.tech/neondb?sslmode=require`).
2. Tạo file dump từ database local. `pg_dump` không có trong PATH, nên gọi bằng đường dẫn đầy đủ của
   PostgreSQL 17. Đứng ở `D:\OC Studio`:

   ```powershell
   New-Item -ItemType Directory -Force D:\oc-backup
   & "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" --format=custom --no-owner --no-privileges `
     --dbname "postgresql://postgres:<mật-khẩu-postgres-local>@localhost:5432/oc_studio" `
     --file D:\oc-backup\oc_studio.dump
   ```

   (Mật khẩu có ký tự đặc biệt `@ : / # ? %` thì phải URL-encode, giống trong `.env.local`. Có thể
   copy nguyên giá trị `DATABASE_URL` trong `.env.local`.)

3. Đưa dump lên Neon. Vẫn đứng ở `D:\OC Studio`:

   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --no-owner --no-privileges `
     --dbname "<DATABASE_URL_UNPOOLED của Neon>" D:\oc-backup\oc_studio.dump
   ```

   - Nếu báo lỗi kiểu `relation ... already exists`: database Neon không còn trống (ví dụ migration
     đã chạy trước). Vào trang Neon của store (**Open in Neon**) → **Branches** → tạo database
     trống mới, hoặc xóa database cũ rồi tạo lại, rồi chạy lại lệnh trên. Đừng chạy lệnh này vào
     database đã có dữ liệu bạn cần.
   - Dump có cả bảng lịch sử migration (`drizzle.__drizzle_migrations`), nên lúc build Vercel chỉ
     chạy thêm các migration mới hơn.

4. Kiểm tra nhanh — đếm số nhân vật trên Neon. Đứng ở `D:\OC Studio`:

   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" "<DATABASE_URL_UNPOOLED của Neon>" `
     -c "select count(*) from characters where deleted_at is null;"
   ```

Database local **không bị thay đổi** — `pg_dump` chỉ đọc.

## Bước 5 — Đưa ảnh cũ trong `storage/` lên Blob

Ảnh trên máy nằm ở `D:\OC Studio\storage\media\…`. Script `scripts/migrate-media-to-blob.ts` đọc
danh sách ảnh trong bảng `media_assets` và tải từng file lên Blob **đúng tại storage key cũ**. Vì
database chỉ lưu storage key (không lưu đường dẫn/URL), **không dòng nào trong database phải sửa**:
sau khi tải xong, `/media/<id>` trên Vercel tìm thấy ảnh trong Blob. Script chỉ **đọc** database.

1. Lấy token: Vercel → **Storage** → store Blob → tab **.env.local** → **Show secret** → copy giá trị
   `BLOB_READ_WRITE_TOKEN`.
2. Chạy thử (dry run — không tải gì lên). Đứng ở `D:\OC Studio`, trong **cùng một cửa sổ PowerShell**:

   ```powershell
   $env:BLOB_READ_WRITE_TOKEN = "<token vừa copy>"
   pnpm media:to-blob
   ```

   Script dùng `DATABASE_URL` trong `.env.local` (database local — cùng dữ liệu với Neon sau Bước 4).
   Token chỉ tồn tại trong cửa sổ PowerShell này; **đừng** ghi nó vào `.env.local`, nếu không
   `pnpm dev` trên máy sẽ ghi ảnh vào Blob thật.

3. Nếu báo “Dry run ổn”, tải lên thật (vẫn cửa sổ đó, vẫn ở `D:\OC Studio`):

   ```powershell
   pnpm media:to-blob --apply
   ```

   - Chạy lại bao nhiêu lần cũng an toàn: ảnh đã có trên Blob thì bỏ qua, ảnh khác kích thước thì
     chỉ báo, không bao giờ ghi đè.
   - “THIẾU file trên đĩa”: database có ảnh nhưng thư mục không có file — kiểm tra
     `MEDIA_STORAGE_DIR` hoặc thêm `--dir "<thư mục storage>"`.
   - Mỗi ảnh tải lên tốn 1 _advanced operation_ (gói Hobby: 2.000/tháng).

4. Đóng cửa sổ PowerShell đó (xóa token khỏi phiên). Giữ lại thư mục `storage/` trên máy làm
   backup.

## Bước 6 — Deploy lại và kiểm tra

1. (Nếu chọn Neon/Blob ở Singapore) Vercel → **Settings → Functions → Function Region** → chọn
   **Singapore (sin1)** → Save.
2. **Deployments** → bản deploy mới nhất → **⋯ → Redeploy**. Trong log build phải thấy:
   `→ Chạy migration trên ep-….neon.tech/neondb…` rồi `✔ Database đã ở phiên bản schema mới nhất.`
3. Mở domain `https://<tên-project>.vercel.app` trên điện thoại:
   - Phải hiện trang **Đăng nhập**. Nhập `APP_PASSWORD`.
   - Mở một nhân vật có ảnh → ảnh hiện ra.
   - Tải thử một ảnh mới (≤ 8 MB) → hiện “Đã tải ảnh lên”.
   - Thử AI ở hồ sơ một mục (nếu đã cấu hình Gemini).
4. Kiểm tra bảo vệ: mở cửa sổ ẩn danh, vào `https://<domain>/api/health` → phải là lỗi **401**.

Từ giờ mỗi lần `git push` lên `main`, Vercel tự build: chạy migration mới (nếu có) rồi deploy. Nếu
migration lỗi, bản deploy dừng lại và bản cũ vẫn chạy.

## Xử lý sự cố

| Triệu chứng                                              | Nguyên nhân / cách sửa                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Mọi trang báo “OC Studio chưa cấu hình đăng nhập” (503)  | Thiếu/sai `APP_PASSWORD` hoặc `AUTH_SECRET` (< 32 ký tự). Sửa ở Settings → Environment Variables → Redeploy.   |
| Build lỗi “Chưa có DATABASE_URL_UNPOOLED / DATABASE_URL” | Neon chưa kết nối với môi trường Production (Bước 2).                                                          |
| Tải ảnh lên báo lỗi lưu trữ                              | Thiếu `BLOB_READ_WRITE_TOKEN` (Bước 3), store không phải Private, hoặc Blob đã vượt giới hạn tháng.            |
| Ảnh cũ không hiện                                        | Chưa chạy Bước 5, hoặc database Neon không phải bản đã restore ở Bước 4.                                       |
| Tác vụ AI báo “không hoàn tất”                           | Request vượt 300 giây hoặc bị dừng khi deploy lại. Bản nháp vẫn còn; tạo lại. Giảm độ dài yêu cầu nếu hay gặp. |
| Mở app lần đầu trong ngày chậm vài giây                  | Neon thức dậy sau khi ngủ — bình thường ở gói Free.                                                            |
| “Thử lại sau N phút” khi đăng nhập                       | Sai mật khẩu quá 5 lần trong 15 phút (hoặc tổng 25 lần từ mọi nơi). Đợi hết thời gian.                         |

## Ghi chú

- **Sao lưu:** thỉnh thoảng chạy lại lệnh `pg_dump` ở Bước 4 với chuỗi Neon (thay cho chuỗi local)
  để có bản sao database trên máy. Ảnh trong Blob có thể tải về từ dashboard Blob.
- **Xóa ảnh / xóa nhân vật:** gỡ một ảnh khỏi nhân vật sẽ xóa file trên Blob nếu không nhân vật nào
  khác dùng nó. Xóa nhân vật là _xóa mềm_ (giữ dữ liệu để có thể khôi phục về sau), nên ảnh của nhân
  vật đó vẫn nằm trên Blob và vẫn tính vào 1 GB. Muốn giải phóng chỗ, gỡ ảnh khỏi nhân vật trước khi
  xóa nó.
- **Ảnh mồ côi:** nếu bạn đóng trang giữa lúc đang tải ảnh lên, file có thể đã lên Blob nhưng chưa
  được gắn vào nhân vật. Chúng không hiện ở đâu cả; có thể xóa trong dashboard Blob nếu cần chỗ.
- **Chạy local vẫn như cũ:** `pnpm dev` với PostgreSQL local, ảnh trong `storage/`, để trống
  `APP_PASSWORD`/`AUTH_SECRET` thì không cần đăng nhập. `pnpm build && pnpm start` (production) thì bắt
  buộc có hai biến đó.
