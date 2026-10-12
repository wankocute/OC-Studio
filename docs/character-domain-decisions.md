# Character Domain — Quyết định thiết kế

> **Trạng thái:** 12 quyết định nghiệp vụ Q1–Q12 **đã được người dùng xác nhận** (TASK 02.1);
> SEN-01..03 được xác nhận ở TASK 03 (mục 10). Phiên bản hiện tại: `schemaVersion: 3`.
> Lưu trữ: [database-design.md](./database-design.md). Đặc tả: [character-fact-schema.md](./character-fact-schema.md).
> Mã: `src/features/characters/domain/`.

## 1. Bảng quyết định Q1–Q12

| #   | Quyết định đã xác nhận                                                 | Trạng thái                                                     | Triển khai                                                                                                                                      |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Trường tùy chỉnh có hai phạm vi: riêng nhân vật và dùng chung thư viện | **Implemented** (domain) · lưu trữ: _deferred_ TASK 03         | `custom.*`/`cg_*` vs `lib.*`/`lg_*`; `createFieldResolver`; `DefinitionContext`; `libraryDefinitionsSchema`; `version`; `findBreakingChanges`   |
| Q2  | `displayName` bắt buộc, độc lập                                        | **Implemented**                                                | Không đồng bộ với trường tên; UI gợi ý: _deferred_ (editor)                                                                                     |
| Q3  | Thêm `explicit_none`                                                   | **Implemented**                                                | Types, schema, `normalizeFactInput`, fingerprint, migration, fixtures                                                                           |
| Q4  | Chỉ gợi ý quan hệ ngược                                                | **Implemented** (contract) · UI: _deferred_                    | `suggestReverseRelationships`                                                                                                                   |
| Q5  | Xóa OC ⇒ tham chiếu thành unlinked, giữ tên và dữ kiện                 | **Implemented** (domain) · thao tác xóa DB: _deferred_ TASK 03 | `detachedFrom`; `detachDeletedCharacter`; `collectLinkedReferences`                                                                             |
| Q6  | Dữ kiện nhạy cảm mặc định không gửi AI                                 | **Implemented** (contract) · tích hợp AI: _deferred_           | `sensitivity`; `selectFactsForAi`; SEN-01/02 (TASK 03): `identity.biological_sex`, `background.family`, `sensitiveItemIds`, `findSensitiveRefs` |
| Q7  | Editor Cơ bản / Nâng cao                                               | **Implemented** (metadata) · editor: _deferred_                | `BASIC_FIELD_KEYS`; `getFieldVisibility`                                                                                                        |
| Q8  | Tách bản dạng giới và giới tính sinh học                               | **Implemented**                                                | `identity.gender_identity`, `identity.biological_sex`; `identity.gender` deprecated                                                             |
| Q9  | Ngôn ngữ nguồn ở cấp nhân vật                                          | **Implemented**                                                | `sourceLanguage?` (BCP 47 dạng chuẩn); `normalizeLanguageInput`                                                                                 |
| Q10 | Truy vết theo khóa trường + id phần tử                                 | **Implemented**                                                | Ngữ nghĩa định nghĩa trong fingerprint; snapshot có phạm vi; xử lý khác thuật toán                                                              |
| Q11 | Giữ giới hạn, tập trung hằng số                                        | **Implemented**                                                | `LIMITS` trong `constants.ts`; thông báo nêu giới hạn                                                                                           |
| Q12 | Mẫu hồ sơ chỉ đổi cách trình bày                                       | **Implemented** (contract) · hệ thống Templates: _deferred_    | `TemplatePresentation`; `createTemplatePresentationSchema`                                                                                      |

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

> **Cập nhật 2026-10-13 (người dùng quyết định):** bỏ dấu nhạy cảm khỏi giao diện và khỏi luồng AI. AI nhận **mọi** dữ kiện thuộc các nhóm nguồn của mục hồ sơ; hộp thoại AI không còn ô cho phép. Trình biên tập không còn huy hiệu "Nhạy cảm", nút đánh dấu từng mục, hay ô "Dữ kiện nhạy cảm" khi tạo trường tùy chỉnh. Dữ liệu và schema **không đổi**: `sensitivity` trên định nghĩa và `sensitiveItemIds` đã lưu vẫn hợp lệ, được giữ nguyên khi lưu, nhưng bị bỏ qua. `selectFactsForAi` vẫn là cổng duy nhất; `selectSectionFacts` gọi nó với quyền cho mọi khóa. Các ghi chú dưới đây mô tả thiết kế cũ.

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

> TASK 03 tăng tiếp lên `schemaVersion: 3` cho metadata nhạy cảm theo phần tử — xem mục 10.

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

### Đã giải quyết ở TASK 03

| Câu hỏi (TASK 02.1)                       | Quyết định — chi tiết trong [database-design.md](./database-design.md)                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lưu định nghĩa thư viện                   | Bảng `library_field_definitions` (`key`, `version`, `definition jsonb`, `status`) + `library_field_groups`; mọi cập nhật đi qua `findBreakingChanges`                                                              |
| Xóa định nghĩa đang dùng                  | Không xóa: chỉ `deprecated` (vẫn phân giải được, không cho dùng mới). Chỉ xóa được định nghĩa `active` **chưa từng** được lưu ở nhân vật nào (kể cả đã soft delete); khóa deprecated không bao giờ được giải phóng |
| Xóa OC                                    | `softDelete` trong một transaction: khóa đích, tìm nguồn qua `character_references`, khóa nguồn, `detachDeletedCharacter`, ghi lại facts + index, soft delete đích                                                 |
| `displayName` lưu ở đâu                   | Cột `display_name` là nguồn duy nhất; JSONB không chứa `displayName` (CHECK constraint)                                                                                                                            |
| `schemaVersion` lưu ở đâu                 | Cột `schema_version`; JSONB không chứa `schemaVersion` (CHECK constraint)                                                                                                                                          |
| `revision`                                | Có — optimistic locking cho mọi thay đổi facts/displayName                                                                                                                                                         |
| Migration JSON khi đọc hay chạy hàng loạt | Khi đọc (trong bộ nhớ, không ghi) + ghi phiên bản mới ở lần cập nhật kế tiếp; `pendingMigration.review` trả về cho UI                                                                                              |

### Còn mở

- **Khôi phục OC đã xóa:** chưa có thao tác restore. Khi làm: không tự liên kết lại; có thể _gợi ý_ các tham chiếu có `detachedFrom.characterId` trùng với OC được khôi phục, người dùng xác nhận từng cái.
- **Review sau migration bị mất khi ghi tự động:** nếu một OC v1 bị viết lại vì OC nó tham chiếu bị xóa, `not_applicable_may_mean_none` không còn được tính lại (dữ liệu vẫn nguyên vẹn; `identity.gender` vẫn là trường deprecated hiển thị `hidden_with_data`). TASK 05 không lưu danh sách review (không thêm cột); thay vào đó trình biên tập và hộp thoại thông tin cơ bản **không ghi** OC còn mục cần xem lại cho tới khi người dùng xác nhận từng mục (`migration_review_required`). Trường hợp xóa OC vẫn còn mở.
- Lưu lựa chọn "cho phép gửi dữ kiện nhạy cảm" trong một phiên làm việc (domain chỉ nhận theo request).
- UI gợi ý `displayName`. (Quan hệ ngược: TASK 05 hiển thị gợi ý dựa trên chỉ mục `character_references`; người dùng tự bấm để thêm, hệ thống chỉ điền nhân vật, không điền loại quan hệ.)

## 9. Giả định kỹ thuật

- `Intl.getCanonicalLocales` có sẵn ở mọi môi trường chạy (Node ≥ 24, trình duyệt hiện đại).
- Item id do client sinh và duy nhất trong danh sách; domain không sinh id.
- Caller luôn truyền **cùng** `DefinitionContext` cho validation, fingerprint, lọc AI và migration của một nhân vật.
- Thời điểm (`detachedFrom.at`) do caller cung cấp; domain không đọc đồng hồ.
- Domain chỉ phụ thuộc `zod`; test kiểm tra không import React/Next/Drizzle/pg/AI SDK/alias `@/`.

## 10. Quyết định về dữ kiện nhạy cảm (TASK 03)

### SEN-01 — Trường có sẵn nhạy cảm

Đánh giá từng trường, **không** đánh dấu cả nhóm `background`:

| Trường                                                                                    | Nhạy cảm?          | Lý do                                                                              |
| ----------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `identity.biological_sex`                                                                 | **Có**             | Theo xác nhận của người dùng; thông tin cơ thể riêng tư, độc lập với bản dạng giới |
| `background.family`                                                                       | **Có**             | Văn bản tự do thường chứa hoàn cảnh gia đình riêng tư (ly hôn, mất mát, bạo lực…)  |
| `background.birthplace`, `hometown`, `culture`                                            | Không              | Thông tin bối cảnh, ít rủi ro                                                      |
| `background.upbringing`, `education`, `training`, `economic_status`                       | Không              | Thông tin tiểu sử phổ biến; phần riêng tư cụ thể có thể ghi ở trường nhạy cảm khác |
| `relationships.entries` (kể cả quan hệ gia đình)                                          | Không ở cấp trường | Quan hệ là dữ kiện cốt lõi; quan hệ riêng tư đánh dấu **theo phần tử** (SEN-02)    |
| `psychology.wounds`, `emotional_triggers`, `coping_mechanisms`; `appearance.scars.origin` | Có (từ TASK 02.1)  | —                                                                                  |

### SEN-02 — Độ nhạy cảm theo phần tử

| Phương án                                                                 | Đánh giá                                                                                                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Thuộc tính trong phần tử (`{ id, title, sensitive: true }`)               | Trộn metadata vào nội dung; mọi object item phải có thêm khóa; JSON chưa lọc gửi đi sẽ mang cờ như một "dữ kiện"                              |
| Bản đồ cấp sheet `privacy: { refs: [...] }`                               | Tách biệt nhưng xa dữ kiện: xóa phần tử dễ để lại ref mồ côi ở nơi khác                                                                       |
| **`sensitiveItemIds` trong envelope `specified` của chính trường** (chọn) | Nằm cạnh giá trị nó mô tả, ngoài nội dung phần tử; validate được (id phải tồn tại); xóa/sửa trường thì metadata đi cùng; JSONB lưu nguyên vẹn |

- Chính sách: trường nhạy cảm ⊃ phần tử nhạy cảm ⊃ trường con nhạy cảm. Quyền theo trường mở mọi phần tử của nó; quyền theo phần tử chỉ mở phần tử đó và không vượt qua được trường cha nhạy cảm.
- Fingerprint **không** tính metadata riêng tư (đánh dấu không làm nội dung "lỗi thời"); `findSensitiveRefs` phát hiện nội dung đã dùng dữ kiện nay trở thành nhạy cảm — tách hai câu hỏi "nội dung còn đúng không?" và "nội dung còn được phép không?".
- **Tăng `schemaVersion` lên 3**: thuộc tính mới là tùy chọn, nhưng schema strict v2 từ chối nó, nên dữ liệu phải được đánh phiên bản rõ ràng. Migration v2 → v3 chỉ đổi số phiên bản; dữ liệu tự nhận v2 mà có `sensitiveItemIds` bị từ chối.
- Lỗi phát hiện khi tích hợp: `detachDeletedCharacter` từng dựng lại envelope và làm mất `sensitiveItemIds`; đã sửa (giữ nguyên envelope, chỉ thay `value`) và có test ở cả domain lẫn database.

### SEN-03 — Trường Cơ bản

Giữ nguyên 31 trường `BASIC_FIELD_KEYS`.
