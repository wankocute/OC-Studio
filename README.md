# OC Studio

Ứng dụng web cá nhân để tạo, quản lý và biên tập hồ sơ nhân vật hư cấu (Original Characters) phục vụ viết truyện và roleplay.

> **Trạng thái:** đã có nền tảng ứng dụng (TASK 01), mô hình dữ kiện nhân vật `schemaVersion: 3` (TASK 02, 02.1, 03) và tầng lưu trữ PostgreSQL + repositories (TASK 03) — xem `docs/`. Chưa có giao diện CRUD nhân vật, editor, AI hay xuất PDF.

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
pnpm dev           # http://localhost:3000
pnpm build && pnpm start   # bản production
```

## Kiểm tra chất lượng

```bash
pnpm typecheck     # next typegen + tsc --noEmit
pnpm lint          # ESLint
pnpm format:check  # Prettier (pnpm format để tự sửa)
pnpm test          # Vitest (unit) — không cần PostgreSQL
pnpm test:integration  # Vitest với PostgreSQL thật, trên database riêng *_test
pnpm test:e2e      # Playwright (tự khởi động pnpm dev nếu chưa chạy)
```

Integration tests dùng `TEST_DATABASE_URL` (đặt trong `.env.test.local`) hoặc tự suy ra từ `DATABASE_URL` bằng cách thêm hậu tố `_test` vào tên database (`oc_studio` → `oc_studio_test`). Database test được tạo tự động nếu chưa có; helper từ chối chạy trên database không kết thúc bằng `_test`.

Lần đầu chạy E2E cần cài trình duyệt: `pnpm exec playwright install chromium`.

## Cấu trúc dự án

```text
src/
├── app/                      # Routes (App Router) — chỉ ghép UI, không chứa business logic
│   ├── (dashboard)/          # Các trang trong application shell (sidebar + topbar)
│   │   ├── page.tsx          #   /            Tổng quan
│   │   ├── characters/       #   /characters  Thư viện nhân vật
│   │   ├── collections/      #   /collections Bộ sưu tập
│   │   ├── templates/        #   /templates   Mẫu hồ sơ
│   │   └── settings/         #   /settings    Cài đặt
│   ├── api/health/           # GET /api/health
│   ├── layout.tsx            # Root layout: fonts, ThemeProvider, TooltipProvider
│   ├── not-found.tsx
│   └── globals.css           # Tailwind + design tokens (CSS variables, light/dark)
├── components/
│   ├── ui/                   # shadcn/ui primitives (sinh bằng CLI)
│   ├── layout/               # AppSidebar, AppTopbar, ThemeToggle
│   ├── shared/               # PageHeader, EmptyState, UnavailableAction
│   └── providers/            # ThemeProvider
├── features/                 # Module theo nghiệp vụ
│   ├── characters/
│   │   ├── domain/           #   Character Fact domain v3 (types, Zod schemas, definitions, migration,
│   │   │                     #   traceability, AI fact filtering, presentation rules) — chỉ phụ thuộc zod
│   │   ├── server/           #   Repositories: nhân vật, định nghĩa trường dùng chung (server-only)
│   │   └── components/       #   CharacterCard
│   ├── library/server/       #   Repositories: tags, collections, media metadata
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
├── lib/                      # env (Zod), utils
└── test/                     # Helpers cho integration tests (database *_test)
docs/                         # Thiết kế: dữ kiện nhân vật, quyết định domain, database, migrations
scripts/db-check.ts           # pnpm db:check
e2e/                          # Playwright specs
```

Các thư mục `features/profiles`, `features/ai-generation`, `features/templates`, `types/` sẽ được tạo khi có code thực sự.

Quy ước code chi tiết: xem [AGENTS.md](./AGENTS.md).
