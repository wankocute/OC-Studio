# Character Domain — Quyết định thiết kế

> **Trạng thái:** 12 quyết định nghiệp vụ Q1–Q12 **đã được người dùng xác nhận** (TASK 02.1) và
> được phản ánh trong `schemaVersion: 2`. Đặc tả: [character-fact-schema.md](./character-fact-schema.md).
> Mã: `src/features/characters/domain/`.

## 1. Bảng quyết định Q1–Q12

| #   | Quyết định đã xác nhận                                                 | Trạng thái                                                     | Triển khai                                                                                                                                    |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Trường tùy chỉnh có hai phạm vi: riêng nhân vật và dùng chung thư viện | **Implemented** (domain) · lưu trữ: _deferred_ TASK 03         | `custom.*`/`cg_*` vs `lib.*`/`lg_*`; `createFieldResolver`; `DefinitionContext`; `libraryDefinitionsSchema`; `version`; `findBreakingChanges` |
| Q2  | `displayName` bắt buộc, độc lập                                        | **Implemented**                                                | Không đồng bộ với trường tên; UI gợi ý: _deferred_ (editor)                                                                                   |
| Q3  | Thêm `explicit_none`                                                   | **Implemented**                                                | Types, schema, `normalizeFactInput`, fingerprint, migration, fixtures                                                                         |
| Q4  | Chỉ gợi ý quan hệ ngược                                                | **Implemented** (contract) · UI: _deferred_                    | `suggestReverseRelationships`                                                                                                                 |
| Q5  | Xóa OC ⇒ tham chiếu thành unlinked, giữ tên và dữ kiện                 | **Implemented** (domain) · thao tác xóa DB: _deferred_ TASK 03 | `detachedFrom`; `detachDeletedCharacter`; `collectLinkedReferences`                                                                           |
| Q6  | Dữ kiện nhạy cảm mặc định không gửi AI                                 | **Implemented** (contract) · tích hợp AI: _deferred_           | `sensitivity`; `selectFactsForAi`                                                                                                             |
| Q7  | Editor Cơ bản / Nâng cao                                               | **Implemented** (metadata) · editor: _deferred_                | `BASIC_FIELD_KEYS`; `getFieldVisibility`                                                                                                      |
| Q8  | Tách bản dạng giới và giới tính sinh học                               | **Implemented**                                                | `identity.gender_identity`, `identity.biological_sex`; `identity.gender` deprecated                                                           |
| Q9  | Ngôn ngữ nguồn ở cấp nhân vật                                          | **Implemented**                                                | `sourceLanguage?` (BCP 47 dạng chuẩn); `normalizeLanguageInput`                                                                               |
| Q10 | Truy vết theo khóa trường + id phần tử                                 | **Implemented**                                                | Ngữ nghĩa định nghĩa trong fingerprint; snapshot có phạm vi; xử lý khác thuật toán                                                            |
| Q11 | Giữ giới hạn, tập trung hằng số                                        | **Implemented**                                                | `LIMITS` trong `constants.ts`; thông báo nêu giới hạn                                                                                         |
| Q12 | Mẫu hồ sơ chỉ đổi cách trình bày                                       | **Implemented** (contract) · hệ thống Templates: _deferred_    | `TemplatePresentation`; `createTemplatePresentationSchema`                                                                                    |

Không có quyết định nào ở trạng thái _Needs clarification_; các câu hỏi chi tiết mới phát sinh nằm ở [mục 8](#8-câu-hỏi-mở).

## 2. Biểu diễn dữ kiện (giữ nguyên từ TASK 02)

|                                   | A. Object lồng theo nhóm  | B. Mỗi trường là object metadata đầy đủ | **C. Map phẳng `fieldKey → { state, value? }`** (chọn) |
| --------------------------------- | ------------------------- | --------------------------------------- | ------------------------------------------------------ |
| Nhiều trạng thái                  | Phải dùng `null`/sentinel | Có                                      | Có, gọn                                                |
| Đổi nhóm / template đổi cách nhóm | Dữ liệu phải di chuyển    | Không                                   | Không                                                  |
| Trường tùy chỉnh                  | Khó                       | Dễ                                      | Dễ (cùng một map)                                      |
| Kích thước                        | Gọn nhất                  | Nặng                                    | Gọn                                                    |
| Kiểu tĩnh                         | Tốt nhất                  | Yếu                                     | Trung bình — kiểm tra lúc chạy theo định nghĩa         |
| JSONB                             | Tốt                       | Phình                                   | Tốt                                                    |

Metadata (kiểu, nhóm, nhãn, độ nhạy cảm, ràng buộc) nằm trong **định nghĩa**, không lặp lại trong dữ liệu. Danh sách luôn có `id` phần tử để truy vết; `multi_select` không cần vì mã lựa chọn đã là định danh. Không tự quy đổi đơn vị. Độ sâu tối đa: Nhóm → Nhóm con → Trường → Trường con (kiểu lá).

## 3. Trạng thái dữ kiện (Q3)

| Phương án cho "xác nhận không có"           | Đánh giá                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Dùng `not_applicable` (TASK 02)             | Lẫn hai ý: "không có" (sự thật về nhân vật) vs "không áp dụng" (khái niệm không phù hợp)                |
| Danh sách rỗng / chuỗi rỗng                 | Mâu thuẫn quy tắc "specified phải có giá trị"; không áp dụng được cho trường đơn; dễ lẫn với ô bỏ trống |
| **Trạng thái riêng `explicit_none`** (chọn) | Rõ nghĩa, không mang giá trị, dùng chung cơ chế envelope                                                |

- Phạm vi: luôn được với trường danh sách; với trường đơn chỉ khi định nghĩa bật `allowExplicitNone` (họ, quốc tịch, học vấn, đào tạo, nghề nghiệp, nơi ở). Với phần lớn trường đơn ("không có chiều cao"), "không có" không phải câu trả lời hợp lý — cho phép sẽ khuyến khích dữ liệu mơ hồ.
- `unspecified` vẫn là "vắng khóa", không lưu tường minh.
- Dữ liệu v1 dùng `not_applicable` **không** bị tự chuyển — migration chỉ đánh dấu để người dùng xem lại.

## 4. Traceability và Change Detection (Q10)

### Phương án đã cân nhắc (TASK 02)

1. **Stable field path + revision** — path theo chỉ số mảng vỡ khi thêm/xóa/sắp xếp; revision toàn sheet quá nhạy; revision theo path cần bộ đếm cho từng path ở mọi đường ghi; sửa rồi hoàn tác vẫn bị coi là thay đổi.
2. **Stable fact ID + hash** (**chọn, giữ nguyên**) — địa chỉ không đổi khi thêm/xóa/sắp xếp; hash tính lại được bất kỳ lúc nào, không cần trạng thái phụ; hoàn tác ⇒ fingerprint trở lại như cũ.

### Bổ sung ở TASK 02.1

- **Ngữ nghĩa định nghĩa:** với trường `custom.*` / `lib.*`, fingerprint băm `{ content, definition }` trong đó `definition` là định nghĩa bỏ đi `group`, `version`, `sensitivity`. Lý do: nhãn trường tùy chỉnh là nội dung người dùng và AI đọc nó như một phần dữ kiện. Trường có sẵn không cần — nhãn chỉ là bản dịch, nghĩa cố định theo khóa.
- **Snapshot có phạm vi:** `FactSnapshot = { algorithm, scope, fingerprints }`. `assessFactSnapshot` phát hiện cả dữ kiện **mới xuất hiện trong phạm vi** (`added`) — nội dung viết khi chưa có màu mắt cần cập nhật khi màu mắt được nhập.
- **Khác thuật toán:** fingerprint có tiền tố (`c53:`). Snapshot khác thuật toán ⇒ `incomparable` (cần tính lại), không bao giờ coi là bằng/khác. `findStaleRefs` coi fingerprint khác thuật toán là lỗi thời (thận trọng).
- Độ chi tiết dừng ở phần tử; tham chiếu nhân vật lồng trong phần tử được báo tại ref của phần tử.

| Thao tác                                                             | Kết quả                                          |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| Sửa trường đơn                                                       | Fingerprint trường đổi                           |
| Sửa một phần tử                                                      | Fingerprint phần tử + trường cha đổi             |
| Thêm / xóa phần tử                                                   | Ref `added` / `removed` + trường cha đổi         |
| Sắp xếp lại                                                          | Chỉ trường cha đổi; identity phần tử giữ nguyên  |
| Chuyển giữa specified / explicit_none / not_applicable / unspecified | Fingerprint trường đổi hoặc biến mất / xuất hiện |
| Đổi nhãn/kiểu trường tùy chỉnh                                       | Fingerprint đổi                                  |
| Đổi nhóm, độ nhạy cảm, tăng `version`                                | Không đổi                                        |
| Sửa rồi hoàn tác                                                     | Trở lại như cũ                                   |

cyrb53 (53-bit) không phải hash bảo mật; đủ cho phát hiện thay đổi trong phạm vi một nhân vật.

## 5. Trường tùy chỉnh hai phạm vi (Q1)

### Namespace và phân giải

| Phương án                                                         | Đánh giá                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Một namespace, tra cứu lần lượt (nhân vật → thư viện)             | Một khóa có thể khớp cả hai ⇒ mơ hồ, phụ thuộc thứ tự               |
| Trường `scope` trong dữ liệu giá trị                              | Thêm metadata vào mọi giá trị                                       |
| **Tiền tố khóa rời nhau** (chọn): `custom.`/`cg_` vs `lib.`/`lg_` | Phạm vi suy ra từ chính khóa; không thể xung đột; dữ liệu không đổi |

- Không có registry toàn cục: `createFieldResolver(custom, { library })`. Validation nhận định nghĩa thư viện qua tham số (`parseCharacterFacts(input, context)`).
- Thiếu định nghĩa thư viện ⇒ **lỗi** (không bỏ qua): chấp nhận dữ liệu chưa kiểm được sẽ phá bảo đảm "fact sheet đã parse là hợp lệ".
- Định nghĩa thư viện chỉ được đặt trong nhóm có sẵn hoặc nhóm thư viện; định nghĩa riêng có thể đặt trong nhóm thư viện (khi có context).

### Sửa định nghĩa đang được dùng

| Phương án                                                                               | Đánh giá                                                                   |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Cho sửa tự do, dữ liệu cũ có thể mất hợp lệ                                             | Vi phạm yêu cầu                                                            |
| Lưu phiên bản định nghĩa trong từng giá trị, validate theo phiên bản cũ                 | Phức tạp: phải giữ mọi phiên bản cũ; AI/editor phải hiểu nhiều phiên bản   |
| **Chỉ cho phép thay đổi tương thích trên cùng khóa; thay đổi phá vỡ ⇒ khóa mới** (chọn) | Giá trị cũ luôn hợp lệ với định nghĩa mới; `version` chỉ là bộ đếm sửa đổi |

`findBreakingChanges(prev, next)` là cổng kiểm tra cho kho lưu trữ (TASK 03). Nếu thay đổi phá vỡ vẫn lọt vào, validation báo lỗi — không xóa dữ liệu.

## 6. Các quyết định khác

### Q2 — Tên hiển thị

Giữ như TASK 02. Không có hàm đồng bộ; test bảo đảm `displayName` khác `identity.full_name` vẫn hợp lệ.

### Q4 — Quan hệ ngược

Gợi ý khi A liên kết tới B và B chưa có quan hệ nào liên kết tới A. Gợi ý **không** mang loại/trạng thái (không suy ra "mentor" ⇒ "mentee", không coi "friend" là đối xứng). Chỉ xét `relationships.entries`.

### Q5 — Xóa OC được tham chiếu

- `unlinked` + `detachedFrom { characterId, reason: "character_deleted", at }` phân biệt 3 trường hợp (liên kết / chưa có hồ sơ / từng liên kết) mà không cần kiểu tham chiếu mới — dữ liệu v1 vẫn hợp lệ.
- `detachDeletedCharacter` là hàm thuần; `at` do caller truyền (domain không đọc đồng hồ).
- Không tự liên kết lại, kể cả khi OC được khôi phục (xem câu hỏi mở).

### Q6 — Nhạy cảm

- Mức phân loại ở **định nghĩa** (trường, trường con), không ở giá trị: người dùng không phải đánh dấu từng lần nhập, và chính sách áp dụng nhất quán.
- Quyền cho phép là **tham số theo request**. Domain cố ý không có nơi lưu quyền ⇒ không thể "nhớ" sự đồng ý.
- `explicit_none`/`not_applicable` của trường nhạy cảm cũng bị loại — "xác nhận không có tổn thương" cũng là thông tin riêng tư.
- Trường con nhạy cảm không được `required`, để việc gỡ không làm phần tử mất hợp lệ.

### Q7 — Cơ bản / Nâng cao

Metadata trình bày tách khỏi định nghĩa dữ liệu (`presentation.ts`) — không thay đổi mô hình lưu. Trường đã có dữ liệu nhưng bị ẩn được báo `hidden_with_data`.

### Q8 — Giới tính

- Không tái sử dụng `identity.gender`: nghĩa cũ mơ hồ, dùng lại khóa với nghĩa mới sẽ âm thầm diễn giải dữ liệu cũ.
- `identity.gender` thành **deprecated** thay vì bị xóa: dữ liệu v1 vẫn hợp lệ ở v2 ⇒ migration không bao giờ mất dữ liệu; editor ẩn trường này trừ khi có dữ liệu cũ, để người dùng tự chuyển.
- Lựa chọn trung tính, luôn có `other` và `not_applicable` cho nhân vật phi nhân loại.

### Q9 — Ngôn ngữ nguồn

| Vị trí                                     | Đánh giá                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| Metadata bản ghi (cột DB)                  | Tách khỏi dữ kiện khi xuất/nhập JSON; AI phải đọc hai nơi                    |
| **`CharacterFacts.sourceLanguage`** (chọn) | Đi cùng dữ kiện; validate cùng schema; tùy chọn                              |
| Theo từng trường                           | Nặng, không cần — yêu cầu cho phép trộn ngôn ngữ mà không bắt mã theo trường |

Chỉ nhận dạng chuẩn (`Intl.getCanonicalLocales`) để một ngôn ngữ luôn được lưu một cách.

### Q11 — Giới hạn

Giữ nguyên giá trị; gom vào `LIMITS`. Tách riêng `historyEvents` (500) thay vì số cứng trong định nghĩa. Thông báo lỗi nêu giới hạn.

### Q12 — Mẫu hồ sơ

Contract chỉ gồm `hiddenFields`, `fieldOrder`, `groupPlacement`, `libraryFields`. Schema strict nên mẫu không thể mang khóa/kiểu/giá trị. Mẫu là đối tượng cấp thư viện ⇒ không được tham chiếu trường riêng của một nhân vật.

## 7. Phiên bản schema và tương thích

**Tăng lên `schemaVersion: 2`** vì: thêm trạng thái mới (`explicit_none`), thêm thuộc tính cấp sheet (`sourceLanguage`), thay đổi ngữ nghĩa trường giới tính. Một bộ đọc v1 sẽ hiểu sai hoặc từ chối dữ liệu v2.

| Thay đổi                                                              | Phá vỡ tương thích?                     | Xử lý                                                  |
| --------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `parseCharacterFacts` chỉ nhận v2                                     | **Có** với dữ liệu v1                   | `migrateCharacterFacts` (thuần dữ liệu, không mất mát) |
| `explicit_none`                                                       | Có với bộ đọc v1                        | —                                                      |
| `identity.gender` deprecated                                          | Không (vẫn hợp lệ)                      | Review thủ công                                        |
| `detachedFrom`, `sensitivity`, `allowExplicitNone`, `sourceLanguage`  | Không (tùy chọn)                        | —                                                      |
| Fingerprint trường tùy chỉnh có ngữ nghĩa định nghĩa                  | Có với fingerprint đã lưu               | Chưa có fingerprint nào được lưu (chưa có AI)          |
| `normalizeFactInput` thêm `explicitNone`                              | Không                                   | —                                                      |
| `CHARACTER_FACTS_SCHEMA_VERSION`, `LIMITS` chuyển sang `constants.ts` | Không (vẫn export từ `domain/index.ts`) | —                                                      |
| `findFieldDefinition` nhận thêm `context`                             | Không (tham số tùy chọn)                | —                                                      |

Migration không thể xác định ⇒ không đoán: giới tính và `not_applicable` được trả về trong `review`; dữ liệu "v1" không hợp lệ hoặc chứa tính năng v2 ⇒ `rejected`.

## 8. Câu hỏi mở

### Cho TASK 03 (PostgreSQL & Drizzle)

1. **Lưu định nghĩa thư viện:** bảng riêng (`library_field_definitions` có `key`, `version`, `definition jsonb`) và cổng `findBreakingChanges` khi cập nhật.
2. **Xóa định nghĩa thư viện đang được dùng:** chặn xóa, hay chuyển thành deprecated? (Domain hiện báo lỗi "thiếu định nghĩa" nếu bị xóa.)
3. **Xóa OC:** chạy `detachDeletedCharacter` trên mọi nhân vật tham chiếu trong cùng transaction; cần chỉ mục tham chiếu (trích từ `collectLinkedReferences`) để tìm nhanh.
4. **Khôi phục OC đã xóa (nếu có thùng rác):** có đề xuất liên kết lại các tham chiếu có `detachedFrom.characterId` trùng không? Domain **không** tự liên kết lại; mọi liên kết lại phải do người dùng xác nhận.
5. `displayName` lưu ở cột riêng (để sắp xếp/tìm kiếm) và trong JSON — nguồn nào là gốc, và đồng bộ ra sao.
6. Có cần `revision` cấp bản ghi cho optimistic locking (khác mục đích với fingerprint).
7. Migration dữ liệu khi đọc (`migrateCharacterFacts` lúc load) hay chạy một lần cho toàn bộ bảng; cách hiển thị danh sách `review` cho người dùng.

### Cho các task sau

- Độ nhạy cảm theo **từng phần tử** (một sự kiện cụ thể) — hiện chỉ theo trường/trường con.
- Lưu lựa chọn "cho phép gửi trường nhạy cảm" trong một phiên làm việc (domain chỉ nhận theo request).
- Danh sách `BASIC_FIELD_KEYS` là đề xuất — điều chỉnh khi thiết kế editor.
- Trường có sẵn nào nữa nên nhạy cảm (ví dụ `identity.biological_sex`, `background.family`)? Hiện chỉ đánh dấu 3 trường + 1 trường con.
- UI gợi ý `displayName` và quan hệ ngược.

## 9. Giả định kỹ thuật

- `Intl.getCanonicalLocales` có sẵn ở mọi môi trường chạy (Node ≥ 24, trình duyệt hiện đại).
- Item id do client sinh và duy nhất trong danh sách; domain không sinh id.
- Caller luôn truyền **cùng** `DefinitionContext` cho validation, fingerprint, lọc AI và migration của một nhân vật.
- Thời điểm (`detachedFrom.at`) do caller cung cấp; domain không đọc đồng hồ.
- Domain chỉ phụ thuộc `zod`; test kiểm tra không import React/Next/Drizzle/pg/AI SDK/alias `@/`.
