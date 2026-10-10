# OC Studio

Ứng dụng web cá nhân để tạo, quản lý và biên tập hồ sơ nhân vật hư cấu (Original Characters) phục vụ viết truyện và roleplay.

> **Trạng thái:** đã có nền tảng ứng dụng (TASK 01), mô hình dữ kiện nhân vật `schemaVersion: 3` (TASK 02–03), lưu trữ PostgreSQL (TASK 03) , giao diện thư viện nhân vật (TASK 04): tạo / xem / sửa thông tin cơ bản / xóa OC, tìm kiếm, sắp xếp, yêu thích, thẻ, bộ sưu tập, ảnh đại diện và ảnh tham khảo; và trình biên tập dữ kiện (TASK 05): mọi nhóm dữ kiện, chế độ Cơ bản / Nâng cao, bốn trạng thái dữ kiện, tự động lưu có xử lý xung đột, trường tùy chỉnh riêng và dùng chung, quan hệ nhân vật, đánh dấu nhạy cảm theo phần tử, xem lại dữ liệu cũ và ngôn ngữ nguồn; và hồ sơ chi tiết (TASK 06, `/characters/[id]/profile`): các mục văn bản soạn bằng Tiptap, tự động lưu, bản nháp tách khỏi bản đã duyệt, lịch sử phiên bản có khôi phục, thêm / đổi tên / sắp xếp / ẩn mục và xem trước. Đã có AI hỗ trợ viết từng mục (TASK 07); chưa có xuất PDF.

> Sau khi cập nhật lên TASK 06 cần áp migration mới (sao lưu trước, xem `docs/database-migrations.md`): `pnpm db:migrate`.

## AI viết từng mục (TASK 07)

TASK 07.1 dùng Gemini mặc định, chọn `gemini-3.8-flash`: đầu vào/đầu ra văn bản
có [Free Tier trong bảng giá Google](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)
và hỗ trợ [JSON có cấu trúc](https://ai.google.dev/gemini-api/docs/generate-content/structured-output),
đã kiểm tra ngày 2026-10-10. App chỉ chấp nhận model Gemini này; không tự đổi model/provider.

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
   ```

Google có thể dùng nội dung Free Tier để cải thiện sản phẩm; thông tin này cũng
hiện ở bước preview. Quota thực tế phụ thuộc project và có thể thay đổi: xem
[rate limits trong AI Studio](https://aistudio.google.com/usage?tab=rate-limit),
app không hardcode quota. Khi hết quota/429, app báo tiếng Việt và chỉ thử lại khi
bạn bấm tạo lại. Thiếu key/model hợp lệ thì nút tạo bị vô hiệu hóa, soạn thủ công vẫn hoạt động.

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

Đề xuất chưa áp dụng hết hạn sau 15 phút hoặc khi server khởi động lại; tối đa
100 bản trong bộ nhớ. Một lần gọi chờ tối đa 60 giây, dữ kiện ≤ 60 000 ký tự,
yêu cầu ≤ 2 000 ký tự, output ≤ 12 000 ký tự và 6 000 token. Không tự retry.
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
