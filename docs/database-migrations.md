# Database Migrations

Có **hai loại migration** độc lập — đừng nhầm lẫn:

|              | DDL migration (Drizzle)             | JSON schema migration (`CharacterFacts`)                       |
| ------------ | ----------------------------------- | -------------------------------------------------------------- |
| Thay đổi     | Bảng, cột, ràng buộc, index         | Cấu trúc dữ kiện bên trong `characters.facts`                  |
| Ở đâu        | `src/db/migrations/*.sql`           | `src/features/characters/domain/migration.ts`                  |
| Khi nào chạy | Thủ công: `pnpm db:migrate`         | Tự động khi đọc (trong bộ nhớ); ghi lại ở lần cập nhật kế tiếp |
| Theo dõi     | Bảng `drizzle.__drizzle_migrations` | Cột `characters.schema_version`                                |

## 1. Quy trình DDL

1. Sửa schema trong `src/db/schema/*.ts`.
2. Sinh migration: `pnpm db:generate --name=<mô_tả_ngắn>` — chỉ tạo file SQL, không chạm database.
3. **Đọc file SQL được sinh ra.** Từ chối/viết lại nếu có `DROP`, `TRUNCATE`, `DELETE`, đổi tên cột/bảng, hoặc đổi kiểu cột có dữ liệu (test `src/db/migrations.int.test.ts` cũng chặn các câu lệnh này).
4. Chạy integration tests (tự áp migration lên database test): `pnpm test:integration`.
5. **Sao lưu** database thật (mục 3).
6. Áp dụng: `pnpm db:migrate`.
7. Kiểm tra: `pnpm db:check` và trạng thái migration (mục 2).

Quy tắc:

- **Không dùng `drizzle-kit push`** cho database thật — nó áp thay đổi trực tiếp, không có file migration để review và không có lịch sử.
- Không sửa file migration đã được áp dụng; tạo migration mới.
- Không reset schema, không `DROP TABLE` để sửa lỗi khi đã có dữ liệu. Thay đổi phá hủy (xóa cột, đổi kiểu) làm theo kiểu expand–contract: thêm mới → chuyển dữ liệu → (sau khi xác nhận và sao lưu) mới bỏ cái cũ, mỗi bước một migration riêng.
- Transaction của PostgreSQL **không** thay thế backup: nó chỉ bảo vệ khỏi migration chạy dở, không bảo vệ khỏi một migration đúng cú pháp nhưng sai ý định.

## 2. Kiểm tra trạng thái

```bash
pnpm db:check   # kết nối + phiên bản PostgreSQL (chỉ đọc)
```

Migration đã áp dụng được ghi trong `drizzle.__drizzle_migrations` (mỗi file một dòng, theo hash). Chạy `pnpm db:migrate` nhiều lần là an toàn: file đã áp dụng được bỏ qua (có integration test kiểm tra).

Truy vấn kiểm tra (chỉ đọc), ví dụ trong pgAdmin hoặc `psql`:

```sql
select id, hash, created_at from drizzle.__drizzle_migrations order by created_at;
select table_name from information_schema.tables where table_schema = 'public' order by 1;
```

Danh sách migration hiện có:

| File                      | Nội dung                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `0000_initial_schema.sql` | Tạo 10 bảng của TASK 03 với PK, FK, CHECK và index. Chỉ `CREATE` / `ALTER TABLE … ADD CONSTRAINT`; không có câu lệnh phá hủy                  |
| `0001_profiles.sql`       | TASK 06: thêm `profiles`, `profile_sections`, `content_revisions`. Chỉ `CREATE TABLE` / `ADD CONSTRAINT` / `CREATE INDEX`, không đụng bảng cũ |

## 3. Sao lưu và khôi phục

Trên Windows, công cụ nằm ở `C:\Program Files\PostgreSQL\17\bin\` (không có trong PATH):

```powershell
# Sao lưu (định dạng custom, nén) trước mọi migration trên dữ liệu thật
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -h localhost -d oc_studio -F c -f "oc_studio_$(Get-Date -Format yyyyMMdd_HHmmss).dump"

# Khôi phục vào một database MỚI để kiểm tra bản sao lưu (không ghi đè database đang dùng)
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres -h localhost oc_studio_restore_check
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -U postgres -h localhost -d oc_studio_restore_check "oc_studio_<thời_điểm>.dump"
```

Lưu file dump ngoài thư mục dự án (không commit). Kiểm tra bản sao lưu khôi phục được trước khi chạy migration có rủi ro.

## 4. Database test

- Integration tests dùng database riêng: `TEST_DATABASE_URL` nếu có (đặt trong `.env.test.local`), nếu không thì `DATABASE_URL` với tên database thêm hậu tố `_test` (ví dụ `oc_studio_test`).
- Helper **từ chối chạy** nếu tên database không kết thúc bằng `_test` hoặc trùng với `DATABASE_URL`.
- `pnpm test:integration` tự tạo database test nếu chưa có (`CREATE DATABASE`, không bao giờ `DROP`), áp migration, rồi `TRUNCATE` các bảng dự án trước mỗi test — chỉ trên database `_test`.
- `pnpm test` (unit) không cần PostgreSQL.

## 5. JSON schema migration

- `CHARACTER_FACTS_SCHEMA_VERSION` hiện là **3**. Mỗi phiên bản cũ là tập con của phiên bản sau (v1 ⊂ v2 ⊂ v3), nên migration chỉ đổi số phiên bản và chứng minh kết quả bằng validation.
- Repository đọc: `schema_version` cũ ⇒ migrate trong bộ nhớ, trả `pendingMigration { fromVersion, review }`; **không ghi**. `review` liệt kê điểm cần người dùng quyết định (giới tính v1 mơ hồ, `not_applicable` có thể là "không có") — migration không bao giờ tự đoán.
- Repository ghi: luôn lưu phiên bản hiện tại. Dữ liệu cũ được nâng cấp khi người dùng lưu, hoặc khi bị viết lại do xóa OC được tham chiếu.
- Phiên bản không hỗ trợ / dữ liệu không hợp lệ ⇒ lỗi có cấu trúc, dòng giữ nguyên.
- Không có migration JSON hàng loạt trong TASK 03. Nếu sau này cần (ví dụ trước khi bỏ hỗ trợ v1), viết script chỉ đọc để báo cáo trước, sao lưu, rồi mới chạy cập nhật theo lô với kiểm tra `revision`.

## 6. Database `oc_studio` hiện tại

Ở thời điểm TASK 03, database `oc_studio` **chưa có bảng nào** và chưa được migrate (chỉ database test được migrate tự động). Để áp schema:

```bash
pnpm db:migrate
pnpm db:check
```

Vì database đang rỗng, migration đầu tiên không có rủi ro mất dữ liệu; vẫn nên sao lưu theo thói quen ở các lần sau.
