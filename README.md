# OC Studio

Ứng dụng web cá nhân để tạo, quản lý và biên tập hồ sơ nhân vật hư cấu (Original Characters) phục vụ viết truyện và roleplay.

> **Trạng thái:** đã có nền tảng ứng dụng (TASK 01), mô hình dữ kiện nhân vật `schemaVersion: 3` (TASK 02–03), lưu trữ PostgreSQL (TASK 03) và giao diện thư viện nhân vật (TASK 04): tạo / xem / sửa thông tin cơ bản / xóa OC, tìm kiếm, sắp xếp, yêu thích, thẻ, bộ sưu tập, ảnh đại diện và ảnh tham khảo. Chưa có trình biên tập dữ kiện đầy đủ, AI hay xuất PDF.

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

### Ảnh tải lên

Ảnh được lưu trên đĩa ở `MEDIA_STORAGE_DIR` (mặc định `<thư mục dự án>/storage`, ngoài `public/` và đã nằm trong `.gitignore`). Database chỉ lưu metadata và storage key; ảnh được phục vụ qua `GET /media/<id>` (tra cứu theo id trong database, không bao giờ theo đường dẫn do client gửi). Chấp nhận PNG, JPEG, WebP, GIF tối đa 8 MB — loại tệp được xác định bằng chữ ký tệp, không tin phần mở rộng hay MIME do trình duyệt gửi. Hãy sao lưu thư mục này cùng với database.

## Kiểm tra chất lượng

```bash
pnpm typecheck     # next typegen + tsc --noEmit
pnpm lint          # ESLint
pnpm format:check  # Prettier (pnpm format để tự sửa)
pnpm test          # Vitest (unit) — không cần PostgreSQL
pnpm test:integration  # Vitest với PostgreSQL thật, trên database riêng *_test
pnpm test:e2e      # Playwright — tự khởi động server riêng trên cổng 3210
```

Integration tests dùng `TEST_DATABASE_URL` (đặt trong `.env.test.local`) hoặc tự suy ra từ `DATABASE_URL` bằng cách thêm hậu tố `_test` vào tên database (`oc_studio` → `oc_studio_test`). Database test được tạo tự động nếu chưa có; helper từ chối chạy trên database không kết thúc bằng `_test`.

E2E chạy trên database riêng `<tên>_e2e_test` (tạo, migrate và làm trống tự động) và thư mục ảnh `storage/e2e-test`, với server riêng ở cổng 3210 — không bao giờ dùng lại dev server đang chạy, nên không thể ghi vào dữ liệu thật. Lần đầu cần cài trình duyệt: `pnpm exec playwright install chromium` (hoặc dùng Chrome đã cài: `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`).

## Cấu trúc dự án

```text
src/
├── app/                      # Routes (App Router) — chỉ ghép UI, không chứa business logic
│   ├── (dashboard)/          # Các trang trong application shell (sidebar + topbar)
│   │   ├── page.tsx          #   /            Tổng quan
│   │   ├── characters/       #   /characters, /characters/[id]  Thư viện và hồ sơ nhân vật
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
