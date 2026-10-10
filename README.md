# OC Studio

Ứng dụng web cá nhân để tạo, quản lý và biên tập hồ sơ nhân vật hư cấu (Original Characters) phục vụ viết truyện và roleplay.

> **Trạng thái:** đã có nền tảng ứng dụng (TASK 01), mô hình dữ kiện nhân vật `schemaVersion: 3` (TASK 02–03), lưu trữ PostgreSQL (TASK 03) , giao diện thư viện nhân vật (TASK 04): tạo / xem / sửa thông tin cơ bản / xóa OC, tìm kiếm, sắp xếp, yêu thích, thẻ, bộ sưu tập, ảnh đại diện và ảnh tham khảo; và trình biên tập dữ kiện (TASK 05): mọi nhóm dữ kiện, chế độ Cơ bản / Nâng cao, bốn trạng thái dữ kiện, tự động lưu có xử lý xung đột, trường tùy chỉnh riêng và dùng chung, quan hệ nhân vật, đánh dấu nhạy cảm theo phần tử, xem lại dữ liệu cũ và ngôn ngữ nguồn; và hồ sơ chi tiết (TASK 06, `/characters/[id]/profile`): các mục văn bản soạn bằng Tiptap, tự động lưu, bản nháp tách khỏi bản đã duyệt, lịch sử phiên bản có khôi phục, thêm / đổi tên / sắp xếp / ẩn mục và xem trước. Đã có AI hỗ trợ viết từng mục (TASK 07), in / lưu PDF qua trình duyệt (TASK 08) và bản MVP để dùng thử (TASK 09).

> Sau khi cập nhật lên TASK 06 cần áp migration mới (sao lưu trước, xem `docs/database-migrations.md`): `pnpm db:migrate`.

## Dùng thử (MVP)

**Chạy app:** cài đặt và cấu hình PostgreSQL theo các mục [Cài đặt](#cài-đặt) và [Cấu hình PostgreSQL](#cấu-hình-postgresql) bên dưới (`pnpm install`, tạo `.env.local`, `pnpm db:migrate`), rồi `pnpm dev` và mở <http://localhost:3000>. Trang **Tổng quan** cho biết số OC, OC gần đây và trạng thái PostgreSQL / Trợ lý AI.

**Luồng thử gợi ý:**

1. **Tạo OC** — nút **Tạo nhân vật** (Tổng quan hoặc Thư viện): chỉ cần tên hiển thị.
2. **Nhập dữ kiện** — trên trang nhân vật, **Mở trình biên tập** dữ kiện. Ô để trống nghĩa là "chưa xác định"; thay đổi tự lưu sau khoảng 1 giây.
3. **Viết hồ sơ** — **Mở hồ sơ chi tiết** → **Tạo hồ sơ**, chọn một mục (ví dụ Ngoại hình) và viết; nội dung tự lưu thành bản nháp.
4. **Dùng AI (tùy chọn)** — trong một mục, nhờ AI viết từ dữ kiện của các nhóm nguồn; xem đề xuất rồi mới áp dụng vào bản nháp. Cần cấu hình ở mục [AI viết từng mục](#ai-viết-từng-mục-task-07).
5. **Duyệt** — **Duyệt nội dung** khi bản nháp đã lưu. Sửa tiếp chỉ đổi bản nháp.
6. **In** — **In / Lưu PDF** → **Mở bản in** → chọn "Lưu dưới dạng PDF" trong hộp thoại in (xem [In / Lưu PDF hồ sơ](#in--lưu-pdf-hồ-sơ)).

**Ba loại nội dung:**

- **Dữ kiện** — thông tin gốc về nhân vật (tên, tuổi, ngoại hình…), nhập trong trình biên tập dữ kiện. Đây là nguồn sự thật duy nhất; hồ sơ và AI chỉ đọc từ đây.
- **Bản nháp** — văn bản đang viết của từng mục hồ sơ, tự lưu, có lịch sử phiên bản.
- **Bản đã duyệt** — phiên bản bạn chốt bằng **Duyệt nội dung**; chỉ thay đổi khi bạn duyệt lại. Bản in mặc định dùng bản đã duyệt. Nếu dữ kiện nguồn của một mục đã duyệt thay đổi sau đó, trang nhân vật và hồ sơ hiện cảnh báo "có thể cần xem lại" — app không tự sửa hay duyệt lại.

**Lưu ý khi thử:**

- API key chỉ nằm trong `.env.local` (đã có trong `.gitignore`) — không commit, không dán vào chat hay issue. Trang Tổng quan / Cài đặt chỉ cho biết provider, model và "Đã cấu hình" / "Chưa cấu hình"; "Đã cấu hình" nghĩa là cấu hình local hợp lệ, **không** có nghĩa đã kiểm tra kết nối, quota hay gói Free Tier.
- Gemini phụ thuộc quota của project và có thể phản hồi chậm (mặc định chờ tối đa 300 giây, đổi bằng `AI_REQUEST_TIMEOUT_MS`). AI chạy nền: bạn có thể đóng cửa sổ hoặc chuyển trang trong lúc chờ. Hết quota thì app báo lỗi; bạn vẫn soạn thủ công được.
- Tác vụ AI và đề xuất chỉ được giữ tạm trong bộ nhớ server: đề xuất hết hạn 15 phút sau khi AI viết xong, và mọi thứ mất khi server khởi động lại (trang báo tác vụ không còn, không treo ở trạng thái đang chạy) — hãy áp dụng hoặc bỏ trước đó.
- Dữ liệu nằm trong database PostgreSQL của bạn và thư mục ảnh `storage/`; hãy sao lưu cả hai.

## AI viết từng mục (TASK 07)

TASK 07.1 dùng Gemini mặc định, chọn `gemini-3.8-flash`: đầu vào/đầu ra văn bản
có [Free Tier trong bảng giá Google](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)
và hỗ trợ [JSON có cấu trúc](https://ai.google.dev/gemini-api/docs/generate-content/structured-output),
đã kiểm tra ngày 2026-10-10. Đây là model mặc định; các model khác chỉ dùng được khi nằm trong allowlist (xem "Chọn model" bên dưới). App không tự đổi model/provider.

1. Đăng nhập [Google AI Studio → API keys](https://aistudio.google.com/api-keys),
   tạo key trong một project mới hoặc chọn project **Free Tier** chưa bật billing.
   Xem [hướng dẫn key](https://ai.google.dev/gemini-api/docs/api-key).
2. Không chọn **Set up billing**, không liên kết tài khoản billing hay nâng cấp tier.
   Kiểm tra project tương ứng vẫn ở Free Tier trong AI Studio trước khi dùng.
   [Billing của Google](https://ai.google.dev/gemini-api/docs/billing) gắn với project;
   app **không tự xác minh được trạng thái billing chỉ từ API key**. Một model có
   Free Tier vẫn có thể tính phí nếu key thuộc project đã bật billing.
3. Điền cấu hình server trong `.env.local`, rồi khởi động lại server:

   ```dotenv
   AI_PROVIDER=gemini
   GEMINI_API_KEY=<key của project Free Tier>
   GEMINI_MODEL=gemini-3.8-flash
   # Tùy chọn: các model được hiện trong ô "Model" của cửa sổ AI
   GEMINI_ALLOWED_MODELS=gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite
   ```

**Chọn model:** cửa sổ AI có ô **Model** trước khi tạo. Danh sách lấy từ
`GEMINI_ALLOWED_MODELS` (ID ngăn cách bằng dấu phẩy); `GEMINI_MODEL` là model mặc định và phải
nằm trong danh sách. Không đặt `GEMINI_ALLOWED_MODELS` thì app chỉ cho các model đã kiểm tra trong
code: Gemini 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite — đều ghi "Free of charge" ở cột
Free Tier của [bảng giá](https://ai.google.dev/gemini-api/docs/pricing) khi kiểm tra ngày
2026-10-11 (bảng giá có thể thay đổi; hãy tự kiểm tra lại). Flash-Lite được ghi là lựa chọn ưu tiên
tốc độ, không phải cam kết thời gian hay chất lượng. Server chỉ chấp nhận ID thuộc allowlist (không
tin ID client gửi), chốt model vào tác vụ lúc bắt đầu (đổi lựa chọn sau đó không ảnh hưởng tác vụ
đang chạy) và ghi model đã dùng trên đề xuất. `thinkingConfig.thinkingLevel=LOW` chỉ được gửi cho
model mà [tài liệu thinking](https://ai.google.dev/gemini-api/docs/thinking) liệt kê mức này
(3.8 Flash, 3.6 Flash); Flash-Lite và model không có trong danh mục của app dùng mặc định của Google.
App không tự đổi model khi lỗi hay hết quota, không fallback sang dịch vụ trả phí. **Allowlist chỉ
giới hạn lựa chọn của app, không chứng minh project đang ở Free Tier: nếu project đã bật billing,
Google vẫn có thể tính phí.**

Google có thể dùng nội dung Free Tier để cải thiện sản phẩm; thông tin này cũng
hiện ở bước preview. Quota thực tế phụ thuộc project và có thể thay đổi: xem
[rate limits trong AI Studio](https://aistudio.google.com/usage?tab=rate-limit),
app không hardcode quota. Khi hết quota/429, app báo tiếng Việt và chỉ thử lại khi
bạn bấm tạo lại. Thiếu key/model hợp lệ thì nút tạo bị vô hiệu hóa, soạn thủ công vẫn hoạt động.

Nếu cấu hình gặp lỗi, bước xem trước chỉ rõ biến thiếu hoặc `GEMINI_MODEL` không khớp.
Lỗi Google trả về khi tạo được phân biệt bằng `error.status`, `error.message` và reason:
`API_KEY_INVALID` (key), `INVALID_ARGUMENT` (đối số), `FAILED_PRECONDITION` (điều kiện API),
401 (xác thực), 403 (quyền truy cập), 404 (model). Chi tiết hiển thị đã che key, URL và
dữ kiện gửi đi; không log response. HTTP 400 riêng lẻ không được coi là lỗi payload.
Adapter REST dùng `responseFormat.text.mimeType=APPLICATION_JSON` theo
[enum REST TextResponseFormat](https://ai.google.dev/api/generate-content#TextResponseFormat),
không dùng chuỗi MIME `application/json` cho trường enum này.
Next.js nạp `.env.local` ở thư mục gốc; biến đã có trong môi trường tiến trình được ưu tiên.
Sau khi sửa file, mở lại bước xem trước; với `pnpm start` cần khởi động lại server.

Adapter OpenAI vẫn được giữ, **chỉ** gọi khi bạn đặt rõ `AI_PROVIDER=openai`,
`OPENAI_API_KEY` và `OPENAI_MODEL`; đây là lựa chọn API có tính phí. ChatGPT Plus
và Claude Pro không được dùng để cấp quyền API. Gemini lỗi không bao giờ fallback
sang OpenAI, Claude hoặc model khác. Key/payload không được ghi vào log.

Mở hồ sơ → chọn một mục → **Viết với AI** → xem đúng payload dữ kiện đã lọc,
chọn rõ dữ kiện nhạy cảm nếu cần → nhập yêu cầu → **Tạo nội dung**.
AI không nhận bản nháp, bản duyệt, ảnh hoặc hồ sơ OC liên kết. Nội dung chỉ xuất hiện
ở vùng đề xuất. Chọn **Dùng làm bản nháp** để giữ bản cũ trong lịch sử, rồi duyệt
bằng luồng hiện có. Nếu bản nháp đổi, phải tạo lại; nếu dữ kiện đổi, cần xem lại và
xác nhận đề xuất có thể lỗi thời. Quyền nhạy cảm không được nhớ cho lần tạo sau.

**Chạy nền (TASK 10):** bấm **Tạo nội dung** chỉ tạo một tác vụ trên server rồi trả về
ngay; cửa sổ luôn đóng được (nút X / Escape), đóng hay chuyển trang không hủy tác vụ.
Mục đang được viết hiện "AI đang viết…" ở danh sách mục và ở nút AI (bấm để mở lại);
khi xong, app báo có đề xuất để xem — **không** tự áp dụng hay duyệt. Mỗi mục chỉ có một
tác vụ chạy cùng lúc; bấm lại trả về tác vụ đang chạy, không gọi provider lần nữa. Trình
duyệt hỏi trạng thái mỗi 3 giây (chỉ đọc bộ nhớ server, không gọi Google); có nút
**Hủy tác vụ** (server ngừng chờ và hủy request phía mình, nhưng không bảo đảm Google đã
ngừng xử lý). Dữ kiện và quyền nhạy cảm được chốt ở bước xem trước; trong lúc chạy server
không đọc lại để gửi thêm. Tác vụ, kết quả và lỗi **chỉ nằm trong bộ nhớ của tiến trình
server**: khởi động lại server là mất, trang sẽ báo "Không còn tìm thấy tác vụ AI" thay vì
treo. Không dùng Redis/hàng đợi ngoài.

Lỗi được phân biệt: mạng/DNS/TLS, hết giờ chờ, key/cấu hình, quota/429, nội dung bị Google
chặn (`promptFeedback.blockReason` hoặc `finishReason` như `SAFETY`, `PROHIBITED_CONTENT`,
`SPII`, `RECITATION` — theo [tài liệu generateContent](https://ai.google.dev/api/generate-content)),
output bị cắt (`MAX_TOKENS`), output trống, output sai định dạng. App không đổi safety
settings. Google chặn chỉ ảnh hưởng lần tạo bằng AI: nhập, lưu, duyệt và in thủ công không
bị lọc hay sửa chữ nào.

Đề xuất chưa áp dụng hết hạn 15 phút sau khi được tạo xong hoặc khi server khởi động lại;
tối đa 100 bản trong bộ nhớ. Một lần gọi chờ tối đa `AI_REQUEST_TIMEOUT_MS` (mặc định
300 000 ms, cho phép 10 000–900 000), dữ kiện ≤ 60 000 ký tự,
yêu cầu ≤ 2 000 ký tự, output ≤ 12 000 ký tự và 6 000 token. Không tự retry.
Gemini dùng `thinkingConfig.thinkingLevel=LOW` theo
[tài liệu model](https://ai.google.dev/gemini-api/docs/latest-model#understanding-reasoning-levels).
Phép đo ngày 2026-10-10 trên Node server: TLS 318 ms, gửi request 329 ms,
HTTP 200 sau 82 675 ms với prompt tối giản 5 token và output 2 token; timeout 60 giây
không đủ cho phản hồi đã đo. Đây là một phép đo, không phải cam kết thời gian phản hồi.
Log `[profile-ai]` chỉ chứa loại lỗi, thời gian chờ, HTTP status và mã lỗi transport
đã kiểm tra; không chứa key, URL, facts, instruction hoặc exception message.
TASK 07 không thêm migration; vẫn cần migration `0001_profiles.sql` của TASK 06.
API thật chỉ chạy khi bạn bấm tạo với key thật; các test tự động dùng adapter/fetch
giả và server E2E ghi đè key/model, không phát sinh phí.

## Yêu cầu môi trường

| Thành phần | Phiên bản                                                              |
| ---------- | ---------------------------------------------------------------------- |
| Node.js    | 24 LTS trở lên                                                         |
| pnpm       | 10.x (`npm install -g pnpm@10` hoặc `corepack enable`)                 |
| PostgreSQL | 17 (đã kiểm tra trên 17; các bản 14+ đều phù hợp), chạy trên máy local |

Stack: Next.js 16 (App Router, Cache Components, Turbopack) · React 19 · TypeScript strict · Tailwind CSS 4 · shadcn/ui (Radix) · next-themes · Lucide · Drizzle ORM + node-postgres · Zod 4 · ESLint 9 · Prettier · Vitest · Playwright.

## Cài đặt

```bash
pnpm install
```

## Cấu hình PostgreSQL

1. Tạo database (một lần), ví dụ bằng `psql` hoặc pgAdmin:

   ```sql
   CREATE DATABASE oc_studio;
   ```

   Trên Windows, `psql` thường nằm ở `C:\Program Files\PostgreSQL\17\bin\psql.exe` (không có sẵn trong PATH).

2. Tạo `.env.local` từ file mẫu và điền thông tin thật:

   ```bash
   cp .env.example .env.local
   ```

   ```dotenv
   DATABASE_URL=postgresql://<user>:<password>@localhost:5432/oc_studio
   ```

   Ký tự đặc biệt trong mật khẩu phải được URL-encode (`@` → `%40`, `#` → `%23`…). `.env.local` đã nằm trong `.gitignore`, không bao giờ commit file này.

3. Kiểm tra kết nối (chỉ chạy một câu `SELECT`, không thay đổi dữ liệu):

   ```bash
   pnpm db:check
   ```

   Hoặc khi app đang chạy: mở trang Tổng quan (khối "Trạng thái ứng dụng") hoặc `GET /api/health`.

### Migrations

Schema Drizzle ở `src/db/schema/` (10 bảng — [docs/database-design.md](./docs/database-design.md)), migrations ở `src/db/migrations/`. Quy trình đầy đủ, sao lưu và database test: [docs/database-migrations.md](./docs/database-migrations.md).

```bash
pnpm db:migrate    # áp dụng migration vào DATABASE_URL (sao lưu trước nếu đã có dữ liệu)
pnpm db:generate --name=<mô_tả>   # sinh migration SQL mới từ schema — luôn đọc lại file SQL
pnpm db:studio     # Drizzle Studio
```

Không dùng `drizzle-kit push` cho database thật.

## Chạy ứng dụng

```bash
pnpm db:migrate    # lần đầu, hoặc sau khi có migration mới
pnpm dev           # http://localhost:3000
pnpm build && pnpm start   # bản production
```

### Trình biên tập dữ kiện

Mở một nhân vật → **Mở trình biên tập** (`/characters/<id>/edit`). Form được sinh từ định nghĩa trường của domain (không có component riêng cho từng trường). Thay đổi được tự động lưu sau khoảng 1 giây ngừng gõ, chỉ khi toàn bộ dữ kiện hợp lệ; trạng thái lưu hiển thị ở đầu trang. Nếu nhân vật vừa được sửa ở tab khác, tự động lưu dừng lại và bạn chọn “Giữ thay đổi của tôi” (gộp lên bản mới nhất, hỏi lại nếu cùng một mục bị sửa ở cả hai nơi) hoặc “Tải bản mới nhất”. Hồ sơ lưu bằng định dạng cũ có mục cần xem lại sẽ chỉ được lưu sau khi bạn xác nhận phần xem lại. Trường dùng chung cho nhiều nhân vật được quản lý ở `/fields`.

### In / Lưu PDF hồ sơ

Trong hồ sơ chi tiết (cả chế độ Biên tập và Xem trước), bấm **In / Lưu PDF**, chọn nội dung rồi **Mở bản in**: trang in (`/characters/<id>/profile/print?source=approved|draft`) mở trong thẻ mới. Bấm **In / Lưu PDF** trên trang đó và trong hộp thoại in của trình duyệt chọn máy in **“Lưu dưới dạng PDF”** (Save as PDF), khổ A4, hướng dọc.

- **Bản đã duyệt** (mặc định): chỉ nội dung đã duyệt. Mục chưa được duyệt bị bỏ qua (không lấy bản nháp thay vào) và trang báo số mục bị bỏ.
- **Bản nháp đã lưu**: bản in ghi rõ “Bản nháp — chưa được duyệt”. Nếu còn mục chưa lưu, phải đợi lưu thành công rồi mới mở được.
- Bản in gồm tên hiển thị, ảnh đại diện (nếu có) và các mục hiển thị, không trống, theo đúng thứ tự và tên hiện tại. Không in dữ kiện thô, ảnh tham khảo, lịch sử hay đề xuất AI. Trang in chỉ đọc database.
- Giới hạn: đây là tính năng in của trình duyệt — OC Studio không tự tạo file PDF. Lề, đầu/chân trang (ngày, URL) và việc in nền phụ thuộc tùy chọn trong hộp thoại in; nên tắt “Đầu trang và chân trang” nếu không muốn. Bản in dùng font serif có sẵn của hệ điều hành (Times New Roman, Noto Serif…), không tải font qua mạng; kết quả có thể khác đôi chút giữa các trình duyệt. Chỉ có một mẫu A4 dọc, chưa có mục lục.

### Ảnh tải lên

Ảnh được lưu trên đĩa ở `MEDIA_STORAGE_DIR` (mặc định `<thư mục dự án>/storage`, ngoài `public/` và đã nằm trong `.gitignore`). Database chỉ lưu metadata và storage key; ảnh được phục vụ qua `GET /media/<id>` (tra cứu theo id trong database, không bao giờ theo đường dẫn do client gửi). Chấp nhận PNG, JPEG, WebP, GIF tối đa 8 MB — loại tệp được xác định bằng chữ ký tệp, không tin phần mở rộng hay MIME do trình duyệt gửi. Hãy sao lưu thư mục này cùng với database.

## Kiểm tra chất lượng

```bash
pnpm typecheck     # next typegen + tsc --noEmit
pnpm lint          # ESLint
pnpm format:check  # Prettier (pnpm format để tự sửa)
pnpm test          # Vitest (unit) — không cần PostgreSQL
pnpm test:integration  # Vitest với PostgreSQL thật, trên database riêng *_test
pnpm test:e2e      # Playwright — tự build (thư mục .next-e2e) và chạy server riêng trên cổng 3210
```

Integration tests dùng `TEST_DATABASE_URL` (đặt trong `.env.test.local`) hoặc tự suy ra từ `DATABASE_URL` bằng cách thêm hậu tố `_test` vào tên database (`oc_studio` → `oc_studio_test`). Database test được tạo tự động nếu chưa có; helper từ chối chạy trên database không kết thúc bằng `_test`.

E2E chạy trên database riêng `<tên>_e2e_test` (tạo, migrate và làm trống tự động) và thư mục ảnh `storage/e2e-test`, với bản build production riêng (`.next-e2e`, không đụng `.next` của bạn) chạy ở cổng 3210 — không bao giờ dùng lại dev server đang chạy, nên không thể ghi vào dữ liệu thật. Lần đầu cần cài trình duyệt: `pnpm exec playwright install chromium` (hoặc dùng Chrome đã cài: `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`).

## Cấu trúc dự án

```text
src/
├── app/                      # Routes (App Router) — chỉ ghép UI, không chứa business logic
│   ├── (dashboard)/          # Các trang trong application shell (sidebar + topbar)
│   │   ├── page.tsx          #   /            Tổng quan
│   │   ├── characters/       #   /characters, /characters/[id], /characters/[id]/edit  Thư viện, hồ sơ, trình biên tập
│   │   ├── fields/           #   /fields      Trường dùng chung (định nghĩa cấp thư viện)
│   │   ├── collections/      #   /collections, /collections/[id] Bộ sưu tập
│   │   ├── templates/        #   /templates   Mẫu hồ sơ
│   │   └── settings/         #   /settings    Cài đặt
│   ├── api/health/           # GET /api/health
│   ├── media/[id]/           # GET /media/:id — phục vụ ảnh đã tải lên
│   ├── layout.tsx            # Root layout: fonts, ThemeProvider, TooltipProvider
│   ├── not-found.tsx
│   └── globals.css           # Tailwind + design tokens (CSS variables, light/dark)
├── components/
│   ├── ui/                   # shadcn/ui primitives (sinh bằng CLI)
│   ├── layout/               # AppSidebar, AppTopbar, ThemeToggle
│   ├── shared/               # PageHeader, EmptyState, UnavailableAction, ConfirmDialog, CharacterAvatar
│   └── providers/            # ThemeProvider
├── features/                 # Module theo nghiệp vụ
│   ├── characters/
│   │   ├── domain/           #   Character Fact domain v3 (types, Zod schemas, definitions, migration,
│   │   │                     #   traceability, AI fact filtering, presentation rules) — chỉ phụ thuộc zod
│   │   ├── server/           #   Repositories + truy vấn thư viện (server-only)
│   │   ├── actions.ts        #   Server Actions: tạo, sửa thông tin cơ bản, yêu thích, xóa
│   │   ├── editor/           #   Mô hình trình biên tập (thuần TS): draft ⇄ fact, bố cục nhóm, lỗi, gộp xung đột,
│   │   │                     #   xem lại migration, trường tùy chỉnh, reducer trạng thái
│   │   ├── editor-actions.ts #   Server Actions: tự động lưu, tải bản mới nhất
│   │   ├── library-field-actions.ts # Server Actions: trường dùng chung
│   │   ├── basic-info.ts     #   Form thông tin cơ bản ⇄ facts (dùng chung client/server)
│   │   └── components/       #   Thẻ nhân vật, danh sách, toolbar, hộp thoại
│   ├── library/              #   Thẻ, bộ sưu tập: repositories, Server Actions, components
│   ├── media/                #   Ảnh: nhận diện chữ ký tệp, storage (local), upload, Server Actions
│   ├── settings/             #   ThemeSelector, theme options
│   └── system-status/        #   Trạng thái ứng dụng / database
├── db/
│   ├── index.ts              # Drizzle + pg Pool (server-only, lazy)
│   ├── health.ts             # checkDatabaseHealth()
│   ├── errors.ts             # Phân loại lỗi kết nối
│   ├── repository-errors.ts  # RepositoryError (lỗi có cấu trúc)
│   ├── schema/               # Drizzle schema: characters, library-definitions, library
│   └── migrations/           # SQL migrations (drizzle-kit generate)
├── config/navigation.ts      # Định nghĩa menu
├── i18n/                     # Chuỗi giao diện tiếng Việt (sẵn cho i18n sau này)
├── hooks/
├── lib/                      # env (Zod), utils, ActionResult, định dạng ngày
└── test/                     # Helpers cho integration tests (database *_test)
docs/                         # Thiết kế: dữ kiện nhân vật, quyết định domain, database, migrations
scripts/db-check.ts           # pnpm db:check
e2e/                          # Playwright specs
```

Các thư mục `features/profiles`, `features/ai-generation`, `features/templates`, `types/` sẽ được tạo khi có code thực sự.

Quy ước code chi tiết: xem [AGENTS.md](./AGENTS.md).
