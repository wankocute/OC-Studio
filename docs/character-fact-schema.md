# Character Fact Schema

> **Phiên bản schema:** `schemaVersion: 3` (TASK 03 — bổ sung SEN-01/02 trên nền v2 của TASK 02.1). Các quyết định Q1–Q12 đã được người dùng
> xác nhận; lý do và phần còn mở: [character-domain-decisions.md](./character-domain-decisions.md).
> Mã nguồn: `src/features/characters/domain/`. Dữ liệu v1 (TASK 02) được chuyển bằng
> `migrateCharacterFacts` (mục 12).

## 1. Mục tiêu thiết kế

- Mô tả một nhân vật đủ chi tiết, như một con người: định danh, ngoại hình, tính cách, tâm lý, hành vi, xuất thân, cuộc sống, quá khứ, quan hệ.
- Dùng được cho mọi bối cảnh: hiện đại, lịch sử, fantasy, sci-fi, thế giới hư cấu (lịch riêng, chủng loài phi nhân loại, không có quốc tịch…).
- Mọi dữ kiện đều **tùy chọn**, trừ tên hiển thị.
- Cấu trúc rõ ràng để AI dùng làm **dữ kiện nguồn**, lọc được dữ kiện nhạy cảm, và kiểm tra được kết quả biên tập.
- Mở rộng được bằng trường tùy chỉnh **riêng của nhân vật** hoặc **dùng chung trong thư viện**.
- Mỗi dữ kiện có **địa chỉ ổn định** để truy vết và phát hiện nội dung lỗi thời.
- Lưu được dưới dạng JSON (PostgreSQL `jsonb`) ở TASK 03 mà không cần chuyển đổi.

## 2. Nguyên tắc nghiệp vụ

| Nguyên tắc                 | Cách mô hình đáp ứng                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single Source of Truth** | `CharacterFacts` là nguồn gốc duy nhất. Nội dung AI chỉ _tham chiếu_ dữ kiện qua fact ref + fingerprint; domain không có đường ghi ngược.                                                                     |
| **Strict Editing**         | Dữ kiện chưa nhập không tồn tại trong `values` ⇒ không có gì để AI "điền". Trường như "Tác động", "Ý nghĩa hình xăm", "Phản ứng" chỉ có giá trị khi người dùng nhập. Không có trường nào được suy ra tự động. |
| **Optional Fields**        | Bốn trạng thái `specified` / `unspecified` / `explicit_none` / `not_applicable` (mục 4).                                                                                                                      |
| **Stable Identity**        | Khóa trường ASCII bất biến (`identity.age`), không phụ thuộc nhãn; phần tử lặp lại có `id` riêng; khóa đã bỏ không bao giờ được tái sử dụng (mục 6).                                                          |
| **Không suy luận**         | Không có quan hệ phụ thuộc giữa trường (tuổi ↔ ngày sinh, bản dạng giới ↔ giới tính sinh học ↔ đại từ, hoàn cảnh ↔ tính cách). Quan hệ nhân vật không tự sinh chiều ngược lại.                                |
| **Riêng tư**               | Dữ kiện nhạy cảm mặc định không được gửi cho AI (mục 9).                                                                                                                                                      |

## 3. Cấu trúc tổng thể

```ts
type CharacterFacts = {
  schemaVersion: 3;
  displayName: string; // bắt buộc, độc lập với các trường tên (Q2)
  sourceLanguage?: string; // BCP 47 dạng chuẩn ("vi", "en-US"); vắng = chưa biết (Q9)
  values: Record<FieldKey, FactValue>; // khóa vắng mặt = unspecified
  custom?: {
    // định nghĩa riêng của nhân vật này (Q1)
    groups: CustomGroupDefinition[];
    fields: CustomFieldDefinition[];
  };
};

type FactValue =
  | { state: "specified"; value: FactData; sensitiveItemIds?: ItemId[] } // metadata riêng tư (SEN-02)
  | { state: "explicit_none" }
  | { state: "not_applicable" };
```

- **Định danh kỹ thuật của nhân vật** (`id`, thời điểm tạo/sửa…) thuộc về bản ghi lưu trữ ở TASK 03, không nằm trong fact sheet.
- `values` là một map **phẳng** theo khóa trường. Nhóm/nhóm con chỉ là cách hiển thị, được quy định trong _định nghĩa_ trường (và có thể được mẫu hồ sơ thay đổi khi hiển thị), không lồng trong dữ liệu.
- Phân cấp tối đa: **Nhóm → Nhóm con → Trường → Trường con** (4 cấp). Trường con chỉ được là kiểu lá (_leaf_).
- Định nghĩa **dùng chung** (`lib.*`) không nằm trong fact sheet; khi validate, caller truyền chúng vào qua `DefinitionContext`.

### 3.1. Tên hiển thị (Q2)

`displayName` bắt buộc và **độc lập**: không tự đồng bộ với `identity.common_name` hay `identity.full_name`, được phép khác hai trường đó. UI có thể _gợi ý_ giá trị khi tạo nhân vật (chưa triển khai).

### 3.2. Ngôn ngữ nguồn (Q9)

`sourceLanguage` là ngôn ngữ mặc định của văn bản người dùng nhập, độc lập với ngôn ngữ giao diện và ngôn ngữ hồ sơ xuất ra.

- Thẻ BCP 47 **dạng chuẩn** (`vi`, `en-US`, `zh-Hant-TW`); `en-us` hay `Tiếng Việt` bị từ chối. `normalizeLanguageInput` chuẩn hóa dữ liệu nhập (`en-us` → `en-US`).
- Vắng mặt = chưa biết. Không bao giờ tự gán ngôn ngữ cho văn bản chưa rõ nguồn.
- Một nhân vật có thể chứa nhiều ngôn ngữ; không có mã ngôn ngữ theo từng trường.
- Đặt trong `CharacterFacts` (không phải metadata bản ghi) vì nó mô tả nội dung dữ kiện, đi cùng dữ kiện khi xuất/nhập và khi gửi cho AI.

## 4. Trạng thái dữ kiện (Q3)

| Trạng thái       | Lưu trữ                                | Ý nghĩa                                              | Ví dụ (hình xăm)                | Với AI                                                   |
| ---------------- | -------------------------------------- | ---------------------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| `specified`      | `{ "state": "specified", "value": … }` | Đã có giá trị xác định, hợp lệ theo kiểu của trường. | Có hai hình xăm                 | Dữ kiện nguồn.                                           |
| `unspecified`    | **Không có khóa**                      | Chưa nhập / chưa quyết định.                         | Không biết có hình xăm không    | Bỏ qua hoàn toàn, không được bịa.                        |
| `explicit_none`  | `{ "state": "explicit_none" }`         | Người dùng **xác nhận không có**.                    | Xác nhận không có hình xăm      | Có thể nói rõ là không có; không được thêm.              |
| `not_applicable` | `{ "state": "not_applicable" }`        | Khái niệm **không áp dụng** cho nhân vật.            | Dạng tồn tại không có da để xăm | Có thể nói rõ là không áp dụng; không thay bằng giá trị. |

Quy tắc:

- `unspecified` **không bao giờ được lưu tường minh**; `{ "state": "unspecified" }` bị từ chối.
- `specified` luôn kèm `value` hợp lệ: chuỗi rỗng, `null`, danh sách rỗng, phần tử không có dữ kiện ⇒ **không hợp lệ**.
- `explicit_none` và `not_applicable` không được kèm `value`. **Không có** cách biểu diễn "không có" bằng danh sách rỗng hay chuỗi rỗng.
- Bên trong phần tử lặp lại hoặc object, trường con vắng mặt = chưa xác định; trường con không có `explicit_none` / `not_applicable`.

### 4.1. Trường nào được dùng `explicit_none`

| Loại trường                                                                 | `explicit_none` | Lý do                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Danh sách: `text_list`, `character_ref_list`, `object_list`, `multi_select` | Luôn được       | "Không có biệt danh / hình xăm / quan hệ" là câu trả lời có nghĩa.                                                                                                                                                                       |
| Trường đơn có `allowExplicitNone: true`                                     | Được            | Có nghĩa rõ ràng: `identity.family_name` (không có họ), `identity.nationality` (không quốc tịch), `background.education`, `background.training`, `lifestyle.occupation` (không có nghề), `lifestyle.residence` (không có nơi ở cố định). |
| Các trường đơn khác                                                         | Không           | "Không có chiều cao / màu mắt / ngày sinh" không phải câu trả lời hợp lý — dùng `not_applicable` hoặc giá trị.                                                                                                                           |

Trường tùy chỉnh dùng cùng quy tắc (`allowExplicitNone` trong định nghĩa).

### 4.2. Chuyển dữ liệu nhập từ UI thành trạng thái

Thực hiện bởi `normalizeFactInput({ notApplicable, explicitNone, value })` **trước** khi validate:

| Dữ liệu nhập từ form                                                                     | Kết quả                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Bật "Không áp dụng" (bất kể giá trị)                                                     | `{ state: "not_applicable" }`                        |
| Bật "Xác nhận không có" (bất kể giá trị)                                                 | `{ state: "explicit_none" }`                         |
| Bật cả hai                                                                               | Lỗi lập trình (`TypeError`) — UI không được cho phép |
| `undefined`, `null`, `""`, chỉ khoảng trắng                                              | unspecified (xóa khóa)                               |
| `[]`, hoặc danh sách mà mọi mục đều trống                                                | unspecified — **không** phải `explicit_none`         |
| Object chỉ còn khóa cấu trúc (`id`, `type`, `unit`, `approximate`) sau khi bỏ phần trống | unspecified                                          |
| Chuỗi                                                                                    | `trim()` + chuẩn hóa Unicode NFC                     |
| `false`, `0`                                                                             | **là giá trị thật** → `specified`                    |
| Giá trị sai kiểu (ví dụ `NaN`)                                                           | giữ nguyên → `specified` → validation báo lỗi        |
| Mục trống trong danh sách, trường con trống trong phần tử                                | bị loại bỏ; `id` của các mục còn lại giữ nguyên      |

Schema **không** trim hay chuẩn hóa: parse không bao giờ thay đổi dữ liệu.

## 5. Kiểu giá trị

| Kiểu (`kind`)        | Giá trị lưu trữ                                                                                    | Ghi chú                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `short_text`         | `string`                                                                                           | 1–300 ký tự, không toàn khoảng trắng.                                                                                                                                         |
| `long_text`          | `string`                                                                                           | 1–20 000 ký tự.                                                                                                                                                               |
| `number`             | `number`                                                                                           | Hữu hạn. Cấu hình: `integer`, `min`, `max`.                                                                                                                                   |
| `measure`            | `{ value: number, unit: string, approximate?: boolean }`                                           | Giá trị có đơn vị. `unit` là mã ổn định thuộc danh sách của trường. Không tự quy đổi đơn vị.                                                                                  |
| `boolean`            | `boolean`                                                                                          | `false` là giá trị hợp lệ.                                                                                                                                                    |
| `date`               | `{ type: "calendar", year?, month?, day?, approximate? }` hoặc `{ type: "text", text }`            | Ngày từng phần (cần năm hoặc tháng; có ngày thì phải có tháng; kiểm tra ngày hợp lệ, 29/2 cho phép khi chưa biết năm; năm có thể âm). `text` cho lịch hư cấu / mốc tương đối. |
| `single_select`      | `{ option: code }` hoặc `{ other: string }`                                                        | `other` chỉ khi trường cho phép. Mã ổn định, nhãn dịch được.                                                                                                                  |
| `multi_select`       | `Choice[]`                                                                                         | 1..100 lựa chọn, không trùng.                                                                                                                                                 |
| `text_list`          | `{ id, text }[]`                                                                                   | Mỗi mục có `id` ổn định.                                                                                                                                                      |
| `character_ref`      | `{ type: "character", characterId: uuid }` hoặc `{ type: "unlinked", name, note?, detachedFrom? }` | Xem mục 8.                                                                                                                                                                    |
| `character_ref_list` | `{ id, ref: CharacterRef }[]`                                                                      | Không trùng cùng một nhân vật thư viện.                                                                                                                                       |
| `object`             | `{ [subKey]: LeafValue }`                                                                          | Object có cấu trúc (một giá trị). Dùng cho trường tùy chỉnh.                                                                                                                  |
| `object_list`        | `{ id, [subKey]: LeafValue }[]`                                                                    | Mỗi phần tử ≥ 1 dữ kiện, trường con `required` phải có.                                                                                                                       |

_Leaf kinds_ = mọi kiểu trừ `object`, `object_list`. Trường con chỉ được dùng leaf kinds ⇒ không có lồng vô hạn.

### 5.1. Giới hạn (Q11)

Tập trung trong `LIMITS` (`constants.ts`); schema, định nghĩa và test cùng dùng một nguồn. Giữ nguyên giá trị TASK 02:

| Giới hạn                                            | Giá trị                             |
| --------------------------------------------------- | ----------------------------------- |
| `displayName`                                       | 200 ký tự                           |
| `short_text` / mục `text_list`                      | 300 ký tự                           |
| `long_text`                                         | 20 000 ký tự                        |
| `text_list`, `character_ref_list`                   | 200 mục                             |
| `object_list` mặc định                              | 200 phần tử (`history.events`: 500) |
| Lựa chọn của select / lựa chọn trong `multi_select` | 100                                 |
| Đơn vị của một trường `measure`                     | 20                                  |
| Trường con của một trường                           | 30                                  |
| Nhóm tùy chỉnh / trường tùy chỉnh (mỗi phạm vi)     | 30 / 200                            |
| Mã, khóa con, phần ngẫu nhiên của ID                | 64 ký tự                            |
| Thẻ ngôn ngữ                                        | 35 ký tự                            |

Độ dài tính theo code unit UTF-16, không theo byte. Thông báo lỗi nêu rõ giới hạn (ví dụ "Tối đa 300 ký tự.").

## 6. Định danh ổn định

| Đối tượng                           | Định dạng                                                   | Ví dụ                           | Quy tắc                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Nhóm có sẵn                         | `group` / `group.sub`                                       | `appearance`, `appearance.hair` | Cố định trong code.                                                                                                                        |
| Trường có sẵn                       | `group.name` (snake_case ASCII)                             | `identity.birth_date`           | Không bao giờ đổi tên hay tái sử dụng. Trường bị thay thế được đánh dấu `deprecated` (dữ liệu cũ vẫn hợp lệ) và ý nghĩa mới dùng khóa mới. |
| Nhóm tùy chỉnh riêng / dùng chung   | `cg_<id>` / `lg_<id>`                                       | `cg_magic`, `lg_worldbuilding`  | Sinh một lần khi tạo.                                                                                                                      |
| Trường tùy chỉnh riêng / dùng chung | `custom.<id>` / `lib.<id>`                                  | `custom.spells`, `lib.zodiac`   | Sinh một lần; đổi nhãn không đổi khóa. Tiền tố quyết định phạm vi.                                                                         |
| Trường con                          | snake_case, duy nhất trong trường cha; `id` được dành riêng | `title`, `person`               |                                                                                                                                            |
| Mã lựa chọn / đơn vị                | snake_case ASCII                                            | `romantic_partner`, `cm`        | Không phụ thuộc bản dịch.                                                                                                                  |
| Phần tử lặp lại                     | `[A-Za-z0-9_-]{1,64}`, duy nhất trong danh sách             | `evt_2f9c…`                     | Sinh phía client (khuyến nghị `crypto.randomUUID()`); không đổi khi sửa nội dung hay sắp xếp lại.                                          |
| Nhân vật thư viện                   | UUID                                                        | `0b5c4a6e-…`                    | Do TASK 03 cấp.                                                                                                                            |

**Fact ref** (địa chỉ dữ kiện dùng cho truy vết): `displayName`, `<fieldKey>`, `<fieldKey>[<itemId>]` — ví dụ `history.events[evt_len_da_lat]`. Không xuống cấp trường con.

## 7. Danh sách nhóm và trường mặc định

Thống kê: **9 nhóm, 6 nhóm con, 88 định nghĩa trường** (85 đang dùng + 3 deprecated), **35 trường con**.

- Cột **SL**: _Một_ = một giá trị, _Nhiều_ = danh sách có id ổn định (khi `specified` phải có ≥ 1 phần tử).
- Cột **Không có**: cho phép `explicit_none` (mục 4.1). Mọi trường đều nhận `specified` / `unspecified` / `not_applicable`.
- Cột **Nhạy cảm**: mặc định không gửi cho AI (mục 9).
- Cột **Cơ bản**: hiển thị ở chế độ Cơ bản của editor (mục 10). Chế độ Nâng cao hiển thị mọi trường không deprecated.
- Thứ tự trong bảng là thứ tự hiển thị mặc định. Nhãn là bản tiếng Việt (`labels.vi.ts`); dữ liệu không lưu nhãn.

### Định danh — `identity`

| Khóa                                    | Nhãn                   | Kiểu            | SL    | Không có | Nhạy cảm | Cơ bản | Ràng buộc                                                                                                 |
| --------------------------------------- | ---------------------- | --------------- | ----- | -------- | -------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `identity.full_name`                    | Họ tên đầy đủ          | `short_text`    | Một   |          |          | ✓      | ≤ 300 ký tự                                                                                               |
| `identity.given_name` **(deprecated)**  | Tên (dữ liệu cũ)       | `short_text`    | Một   |          |          |        | ≤ 300 ký tự                                                                                               |
| `identity.family_name` **(deprecated)** | Họ (dữ liệu cũ)        | `short_text`    | Một   | ✓        |          |        | ≤ 300 ký tự                                                                                               |
| `identity.common_name`                  | Tên thường gọi         | `short_text`    | Một   |          |          | ✓      | ≤ 300 ký tự                                                                                               |
| `identity.nicknames`                    | Biệt danh              | `text_list`     | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục                                                                            |
| `identity.other_names`                  | Tên khác               | `object_list`   | Nhiều | ✓        |          |        | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện                                                                    |
| ↳ `name`                                | Tên                    | `short_text`    | Một   |          |          |        | **bắt buộc trong phần tử**; ≤ 300 ký tự                                                                   |
| ↳ `context`                             | Bối cảnh sử dụng       | `short_text`    | Một   |          |          |        | ≤ 300 ký tự                                                                                               |
| `identity.age`                          | Tuổi                   | `measure`       | Một   |          |          | ✓      | đơn vị: `years`, `months`; ≥ 0; cho phép `approximate`                                                    |
| `identity.apparent_age`                 | Tuổi trông như         | `short_text`    | Một   |          |          |        | ≤ 300 ký tự                                                                                               |
| `identity.birth_date`                   | Ngày sinh              | `date`          | Một   |          |          | ✓      | ngày từng phần hoặc văn bản                                                                               |
| `identity.gender` **(deprecated)**      | Giới tính (dữ liệu cũ) | `single_select` | Một   |          |          |        | lựa chọn: `female` (Nữ), `male` (Nam), `non_binary` (Phi nhị nguyên); cho phép `other`                    |
| `identity.gender_identity`              | Bản dạng giới          | `single_select` | Một   |          |          | ✓      | lựa chọn: `woman` (Nữ), `man` (Nam), `non_binary` (Phi nhị nguyên), `agender` (Vô giới); cho phép `other` |
| `identity.biological_sex`               | Giới tính sinh học     | `single_select` | Một   |          | ✓        |        | lựa chọn: `female` (Nữ), `male` (Nam), `intersex` (Liên giới tính); cho phép `other`                      |
| `identity.pronouns`                     | Đại từ xưng hô         | `short_text`    | Một   |          |          | ✓      | ≤ 300 ký tự                                                                                               |
| `identity.nationality`                  | Quốc tịch              | `short_text`    | Một   | ✓        |          |        | ≤ 300 ký tự                                                                                               |
| `identity.species`                      | Chủng loài             | `short_text`    | Một   |          |          | ✓      | ≤ 300 ký tự                                                                                               |
| `identity.languages`                    | Ngôn ngữ sử dụng       | `text_list`     | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục                                                                            |

### Ngoại hình — `appearance`

| Khóa                  | Nhãn                | Kiểu        | SL  | Không có | Nhạy cảm | Cơ bản | Ràng buộc      |
| --------------------- | ------------------- | ----------- | --- | -------- | -------- | ------ | -------------- |
| `appearance.overview` | Ngoại hình tổng thể | `long_text` | Một |          |          | ✓      | ≤ 20.000 ký tự |
| `appearance.voice`    | Giọng nói           | `long_text` | Một |          |          |        | ≤ 20.000 ký tự |

#### Vóc dáng — `appearance.body`

| Khóa                          | Nhãn                     | Kiểu         | SL  | Không có | Nhạy cảm | Cơ bản | Ràng buộc                                                                            |
| ----------------------------- | ------------------------ | ------------ | --- | -------- | -------- | ------ | ------------------------------------------------------------------------------------ |
| `appearance.height`           | Chiều cao                | `measure`    | Một |          |          | ✓      | đơn vị: `cm`, `m`, `in`, `ft`; ≥ 0; cho phép `approximate`                           |
| `appearance.weight`           | Cân nặng                 | `measure`    | Một |          |          |        | đơn vị: `kg`, `lb`; ≥ 0; cho phép `approximate`                                      |
| `appearance.build`            | Vóc dáng                 | `short_text` | Một |          |          |        | ≤ 300 ký tự                                                                          |
| `appearance.body_proportions` | Tỉ lệ cơ thể             | `long_text`  | Một |          |          |        | ≤ 20.000 ký tự                                                                       |
| `appearance.body_details`     | Chi tiết đặc điểm cơ thể | `long_text`  | Một |          | ✓        |        | ≤ 20.000 ký tự; ghi tự do mọi đặc điểm cơ thể chưa có trường riêng (kể cả giải phẫu) |

#### Làn da — `appearance.skin`

| Khóa                      | Nhãn       | Kiểu         | SL  | Không có | Nhạy cảm | Cơ bản | Ràng buộc   |
| ------------------------- | ---------- | ------------ | --- | -------- | -------- | ------ | ----------- |
| `appearance.skin_tone`    | Màu da     | `short_text` | Một |          |          |        | ≤ 300 ký tự |
| `appearance.skin_texture` | Kết cấu da | `short_text` | Một |          |          |        | ≤ 300 ký tự |

#### Gương mặt — `appearance.face`

| Khóa                     | Nhãn                | Kiểu         | SL  | Không có | Nhạy cảm | Cơ bản | Ràng buộc      |
| ------------------------ | ------------------- | ------------ | --- | -------- | -------- | ------ | -------------- |
| `appearance.face_shape`  | Hình dáng gương mặt | `short_text` | Một |          |          |        | ≤ 300 ký tự    |
| `appearance.eye_color`   | Màu mắt             | `short_text` | Một |          |          | ✓      | ≤ 300 ký tự    |
| `appearance.eye_details` | Đặc điểm mắt        | `long_text`  | Một |          |          |        | ≤ 20.000 ký tự |
| `appearance.eyebrows`    | Lông mày            | `short_text` | Một |          |          |        | ≤ 300 ký tự    |
| `appearance.nose`        | Mũi                 | `short_text` | Một |          |          |        | ≤ 300 ký tự    |
| `appearance.lips`        | Môi                 | `short_text` | Một |          |          |        | ≤ 300 ký tự    |

#### Mái tóc — `appearance.hair`

| Khóa                      | Nhãn        | Kiểu         | SL  | Không có | Nhạy cảm | Cơ bản | Ràng buộc   |
| ------------------------- | ----------- | ------------ | --- | -------- | -------- | ------ | ----------- |
| `appearance.hair_color`   | Màu tóc     | `short_text` | Một |          |          | ✓      | ≤ 300 ký tự |
| `appearance.hair_length`  | Độ dài tóc  | `short_text` | Một |          |          |        | ≤ 300 ký tự |
| `appearance.hair_style`   | Kiểu tóc    | `short_text` | Một |          |          |        | ≤ 300 ký tự |
| `appearance.hair_texture` | Kết cấu tóc | `short_text` | Một |          |          |        | ≤ 300 ký tự |

#### Dấu hiệu nhận dạng — `appearance.marks`

| Khóa                           | Nhãn                    | Kiểu          | SL    | Không có | Nhạy cảm | Cơ bản | Ràng buộc                               |
| ------------------------------ | ----------------------- | ------------- | ----- | -------- | -------- | ------ | --------------------------------------- |
| `appearance.tattoos`           | Hình xăm                | `object_list` | Nhiều | ✓        |          |        | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện  |
| ↳ `description`                | Mô tả                   | `long_text`   | Một   |          |          |        | ≤ 20.000 ký tự                          |
| ↳ `location`                   | Vị trí                  | `short_text`  | Một   |          |          |        | ≤ 300 ký tự                             |
| ↳ `meaning`                    | Ý nghĩa                 | `long_text`   | Một   |          |          |        | ≤ 20.000 ký tự                          |
| `appearance.scars`             | Sẹo                     | `object_list` | Nhiều | ✓        |          |        | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện  |
| ↳ `description`                | Mô tả                   | `long_text`   | Một   |          |          |        | ≤ 20.000 ký tự                          |
| ↳ `location`                   | Vị trí                  | `short_text`  | Một   |          |          |        | ≤ 300 ký tự                             |
| ↳ `origin`                     | Nguồn gốc               | `long_text`   | Một   |          | ✓        |        | ≤ 20.000 ký tự                          |
| `appearance.piercings`         | Khuyên xỏ               | `object_list` | Nhiều | ✓        |          |        | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện  |
| ↳ `location`                   | Vị trí                  | `short_text`  | Một   |          |          |        | ≤ 300 ký tự                             |
| ↳ `description`                | Mô tả                   | `short_text`  | Một   |          |          |        | ≤ 300 ký tự                             |
| `appearance.identifying_marks` | Dấu hiệu nhận dạng khác | `object_list` | Nhiều | ✓        |          |        | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện  |
| ↳ `description`                | Mô tả                   | `long_text`   | Một   |          |          |        | ≤ 20.000 ký tự                          |
| ↳ `location`                   | Vị trí                  | `short_text`  | Một   |          |          |        | ≤ 300 ký tự                             |
| `appearance.special_features`  | Đặc điểm đặc biệt       | `object_list` | Nhiều | ✓        |          | ✓      | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện  |
| ↳ `name`                       | Đặc điểm                | `short_text`  | Một   |          |          |        | **bắt buộc trong phần tử**; ≤ 300 ký tự |
| ↳ `description`                | Mô tả                   | `long_text`   | Một   |          |          |        | ≤ 20.000 ký tự                          |

#### Phong cách — `appearance.style`

| Khóa                        | Nhãn                  | Kiểu          | SL    | Không có | Nhạy cảm | Cơ bản | Ràng buộc                               |
| --------------------------- | --------------------- | ------------- | ----- | -------- | -------- | ------ | --------------------------------------- |
| `appearance.clothing_style` | Phong cách trang phục | `long_text`   | Một   |          |          | ✓      | ≤ 20.000 ký tự                          |
| `appearance.accessories`    | Phụ kiện              | `object_list` | Nhiều | ✓        |          |        | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện  |
| ↳ `name`                    | Phụ kiện              | `short_text`  | Một   |          |          |        | **bắt buộc trong phần tử**; ≤ 300 ký tự |
| ↳ `description`             | Mô tả                 | `long_text`   | Một   |          |          |        | ≤ 20.000 ký tự                          |

### Tính cách — `personality`

| Khóa                         | Nhãn                       | Kiểu        | SL    | Không có | Nhạy cảm | Cơ bản | Ràng buộc                      |
| ---------------------------- | -------------------------- | ----------- | ----- | -------- | -------- | ------ | ------------------------------ |
| `personality.summary`        | Tổng quan tính cách        | `long_text` | Một   |          |          | ✓      | ≤ 20.000 ký tự                 |
| `personality.core_traits`    | Đặc điểm tính cách chính   | `text_list` | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục |
| `personality.strengths`      | Ưu điểm                    | `text_list` | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục |
| `personality.weaknesses`     | Nhược điểm                 | `text_list` | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục |
| `personality.values`         | Giá trị sống               | `text_list` | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục |
| `personality.principles`     | Nguyên tắc cá nhân         | `text_list` | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục |
| `personality.likes`          | Điều yêu thích             | `text_list` | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục |
| `personality.dislikes`       | Điều không thích           | `text_list` | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục |
| `personality.contradictions` | Mâu thuẫn trong tính cách  | `text_list` | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục |
| `personality.social_manner`  | Cách ứng xử với người khác | `long_text` | Một   |          |          |        | ≤ 20.000 ký tự                 |

### Tâm lý — `psychology`

| Khóa                            | Nhãn                      | Kiểu          | SL    | Không có | Nhạy cảm | Cơ bản | Ràng buộc                                  |
| ------------------------------- | ------------------------- | ------------- | ----- | -------- | -------- | ------ | ------------------------------------------ |
| `psychology.motivations`        | Động lực                  | `text_list`   | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục             |
| `psychology.goals`              | Mục tiêu                  | `text_list`   | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục             |
| `psychology.fears`              | Nỗi sợ                    | `text_list`   | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục             |
| `psychology.desires`            | Mong muốn                 | `text_list`   | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục             |
| `psychology.beliefs`            | Niềm tin                  | `text_list`   | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục             |
| `psychology.internal_conflicts` | Xung đột nội tâm          | `text_list`   | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục             |
| `psychology.wounds`             | Tổn thương tâm lý         | `object_list` | Nhiều | ✓        | ✓        |        | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện     |
| ↳ `description`                 | Mô tả                     | `long_text`   | Một   |          |          |        | **bắt buộc trong phần tử**; ≤ 20.000 ký tự |
| ↳ `note`                        | Ghi chú                   | `long_text`   | Một   |          |          |        | ≤ 20.000 ký tự                             |
| `psychology.coping_mechanisms`  | Cách đối phó với áp lực   | `text_list`   | Nhiều | ✓        | ✓        |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục             |
| `psychology.emotional_triggers` | Yếu tố kích thích cảm xúc | `object_list` | Nhiều | ✓        | ✓        |        | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện     |
| ↳ `trigger`                     | Yếu tố kích thích         | `short_text`  | Một   |          |          |        | **bắt buộc trong phần tử**; ≤ 300 ký tự    |
| ↳ `reaction`                    | Phản ứng                  | `long_text`   | Một   |          |          |        | ≤ 20.000 ký tự                             |

### Hành vi và giao tiếp — `behavior`

| Khóa                             | Nhãn                           | Kiểu            | SL    | Không có | Nhạy cảm | Cơ bản | Ràng buộc                                                                                                                                                        |
| -------------------------------- | ------------------------------ | --------------- | ----- | -------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `behavior.habits`                | Thói quen                      | `text_list`     | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục                                                                                                                                   |
| `behavior.mannerisms`            | Cử chỉ đặc trưng               | `text_list`     | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục                                                                                                                                   |
| `behavior.demeanor`              | Phong thái                     | `long_text`     | Một   |          |          |        | ≤ 20.000 ký tự                                                                                                                                                   |
| `behavior.stress_response`       | Phản ứng khi căng thẳng        | `long_text`     | Một   |          |          |        | ≤ 20.000 ký tự                                                                                                                                                   |
| `behavior.speech_style`          | Cách nói chuyện                | `long_text`     | Một   |          |          | ✓      | ≤ 20.000 ký tự                                                                                                                                                   |
| `behavior.speech_pace`           | Tốc độ nói                     | `single_select` | Một   |          |          |        | lựa chọn: `very_slow` (Rất chậm), `slow` (Chậm), `moderate` (Vừa phải), `fast` (Nhanh), `very_fast` (Rất nhanh), `variable` (Thay đổi tùy lúc); cho phép `other` |
| `behavior.verbal_tics`           | Từ ngữ thường dùng             | `text_list`     | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục                                                                                                                                   |
| `behavior.emotional_expression`  | Cách thể hiện cảm xúc          | `long_text`     | Một   |          |          |        | ≤ 20.000 ký tự                                                                                                                                                   |
| `behavior.situational_behaviors` | Ứng xử trong tình huống cụ thể | `object_list`   | Nhiều | ✓        |          |        | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện                                                                                                                           |
| ↳ `situation`                    | Tình huống                     | `short_text`    | Một   |          |          |        | **bắt buộc trong phần tử**; ≤ 300 ký tự                                                                                                                          |
| ↳ `behavior`                     | Cách ứng xử                    | `long_text`     | Một   |          |          |        | **bắt buộc trong phần tử**; ≤ 20.000 ký tự                                                                                                                       |

### Xuất thân — `background`

| Khóa                         | Nhãn                       | Kiểu            | SL  | Không có | Nhạy cảm | Cơ bản | Ràng buộc                                                                                                                                                  |
| ---------------------------- | -------------------------- | --------------- | --- | -------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background.birthplace`      | Nơi sinh                   | `short_text`    | Một |          |          |        | ≤ 300 ký tự                                                                                                                                                |
| `background.hometown`        | Quê quán                   | `short_text`    | Một |          |          | ✓      | ≤ 300 ký tự                                                                                                                                                |
| `background.family`          | Hoàn cảnh gia đình         | `long_text`     | Một |          | ✓        | ✓      | ≤ 20.000 ký tự                                                                                                                                             |
| `background.upbringing`      | Môi trường trưởng thành    | `long_text`     | Một |          |          |        | ≤ 20.000 ký tự                                                                                                                                             |
| `background.education`       | Học vấn                    | `long_text`     | Một | ✓        |          |        | ≤ 20.000 ký tự                                                                                                                                             |
| `background.training`        | Quá trình đào tạo          | `long_text`     | Một | ✓        |          |        | ≤ 20.000 ký tự                                                                                                                                             |
| `background.economic_status` | Điều kiện kinh tế gia đình | `single_select` | Một |          |          |        | lựa chọn: `poor` (Nghèo khó), `lower_income` (Thu nhập thấp), `middle_income` (Trung lưu), `upper_income` (Khá giả), `wealthy` (Giàu có); cho phép `other` |
| `background.culture`         | Bối cảnh văn hóa           | `long_text`     | Một |          |          |        | ≤ 20.000 ký tự                                                                                                                                             |

### Cuộc sống — `lifestyle`

| Khóa                          | Nhãn                  | Kiểu            | SL    | Không có | Nhạy cảm | Cơ bản | Ràng buộc                                                                                                                                             |
| ----------------------------- | --------------------- | --------------- | ----- | -------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifestyle.occupation`        | Nghề nghiệp           | `short_text`    | Một   | ✓        |          | ✓      | ≤ 300 ký tự                                                                                                                                           |
| `lifestyle.residence`         | Nơi ở                 | `short_text`    | Một   | ✓        |          |        | ≤ 300 ký tự                                                                                                                                           |
| `lifestyle.living_conditions` | Điều kiện sống        | `long_text`     | Một   |          |          |        | ≤ 20.000 ký tự                                                                                                                                        |
| `lifestyle.daily_routine`     | Thói quen sinh hoạt   | `long_text`     | Một   |          |          |        | ≤ 20.000 ký tự                                                                                                                                        |
| `lifestyle.daily_activities`  | Hoạt động thường ngày | `text_list`     | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục                                                                                                                        |
| `lifestyle.hobbies`           | Sở thích              | `text_list`     | Nhiều | ✓        |          | ✓      | mỗi mục ≤ 300 ký tự, ≤ 200 mục                                                                                                                        |
| `lifestyle.interests`         | Mối quan tâm cá nhân  | `text_list`     | Nhiều | ✓        |          |        | mỗi mục ≤ 300 ký tự, ≤ 200 mục                                                                                                                        |
| `lifestyle.skills`            | Kỹ năng               | `object_list`   | Nhiều | ✓        |          | ✓      | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện                                                                                                                |
| ↳ `name`                      | Kỹ năng               | `short_text`    | Một   |          |          |        | **bắt buộc trong phần tử**; ≤ 300 ký tự                                                                                                               |
| ↳ `proficiency`               | Mức độ thành thạo     | `single_select` | Một   |          |          |        | lựa chọn: `novice` (Mới bắt đầu), `competent` (Cơ bản), `proficient` (Thành thạo), `expert` (Chuyên sâu), `master` (Bậc thầy); không cho phép `other` |
| ↳ `note`                      | Ghi chú               | `long_text`     | Một   |          |          |        | ≤ 20.000 ký tự                                                                                                                                        |

### Quá khứ và sự kiện — `history`

| Khóa             | Nhãn               | Kiểu                 | SL    | Không có | Nhạy cảm | Cơ bản | Ràng buộc                               |
| ---------------- | ------------------ | -------------------- | ----- | -------- | -------- | ------ | --------------------------------------- |
| `history.events` | Sự kiện            | `object_list`        | Nhiều | ✓        |          | ✓      | ≤ 500 phần tử, mỗi phần tử ≥ 1 dữ kiện  |
| ↳ `title`        | Tiêu đề            | `short_text`         | Một   |          |          |        | **bắt buộc trong phần tử**; ≤ 300 ký tự |
| ↳ `time`         | Thời điểm          | `date`               | Một   |          |          |        | ngày từng phần hoặc văn bản             |
| ↳ `description`  | Mô tả              | `long_text`          | Một   |          |          |        | ≤ 20.000 ký tự                          |
| ↳ `involved`     | Nhân vật liên quan | `character_ref_list` | Nhiều |          |          |        | không trùng nhân vật thư viện           |
| ↳ `impact`       | Tác động / hậu quả | `long_text`          | Một   |          |          |        | ≤ 20.000 ký tự                          |

### Quan hệ nhân vật — `relationships`

| Khóa                    | Nhãn            | Kiểu            | SL    | Không có | Nhạy cảm | Cơ bản | Ràng buộc                                                                                                                                                                                                                                                                              |
| ----------------------- | --------------- | --------------- | ----- | -------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relationships.entries` | Các mối quan hệ | `object_list`   | Nhiều | ✓        |          | ✓      | ≤ 200 phần tử, mỗi phần tử ≥ 1 dữ kiện                                                                                                                                                                                                                                                 |
| ↳ `person`              | Nhân vật        | `character_ref` | Một   |          |          |        | **bắt buộc trong phần tử**                                                                                                                                                                                                                                                             |
| ↳ `type`                | Loại quan hệ    | `single_select` | Một   |          |          |        | lựa chọn: `family` (Gia đình), `romantic_partner` (Người yêu / bạn đời), `friend` (Bạn bè), `rival` (Đối thủ), `enemy` (Kẻ thù), `mentor` (Người dẫn dắt), `mentee` (Người được dẫn dắt), `colleague` (Đồng nghiệp), `ally` (Đồng minh), `acquaintance` (Người quen); cho phép `other` |
| ↳ `status`              | Trạng thái      | `single_select` | Một   |          |          |        | lựa chọn: `ongoing` (Đang duy trì), `strained` (Căng thẳng), `estranged` (Xa cách), `ended` (Đã kết thúc); cho phép `other`                                                                                                                                                            |
| ↳ `description`         | Mô tả quan hệ   | `long_text`     | Một   |          |          |        | ≤ 20.000 ký tự                                                                                                                                                                                                                                                                         |
| ↳ `notes`               | Ghi chú         | `long_text`     | Một   |          |          |        | ≤ 20.000 ký tự                                                                                                                                                                                                                                                                         |

### 7.1. Giới tính (Q8)

- `identity.gender_identity` (Bản dạng giới) và `identity.biological_sex` (Giới tính sinh học) là hai trường **độc lập**, đều tùy chọn, đều cho phép giá trị khác (`other`) và `not_applicable`.
- Không suy ra trường này từ trường kia, cũng không suy ra `identity.pronouns`.
- `identity.given_name` / `identity.family_name` **deprecated** từ TASK 10: editor chỉ dùng `identity.full_name` (tách/ghép họ tên phụ thuộc thứ tự tên theo văn hóa nên không tự ghép). Giá trị đã lưu vẫn hợp lệ, hiện chỉ-đọc trong nhóm Định danh (có nút xóa) để người dùng tự chuyển sang "Họ tên đầy đủ"; không đổi `schemaVersion` vì mọi dữ liệu v3 vẫn hợp lệ. Khóa không bao giờ được dùng lại.
- `appearance.body_details` (TASK 10) mặc định **nhạy cảm**: chỉ gửi cho AI khi người dùng cho phép trong lần tạo đó. Nhập/lưu thủ công không qua bộ lọc hay kiểm duyệt nào; nhà cung cấp AI từ chối chỉ ảnh hưởng lần tạo bằng AI.
- `identity.gender` (v1) là trường **deprecated**: dữ liệu cũ vẫn hợp lệ và được giữ nguyên; editor không cho nhập mới; khóa này không bao giờ được dùng lại với nghĩa khác. Người dùng tự chuyển giá trị sang một trong hai trường mới (migration không tự đoán).

## 8. Tham chiếu nhân vật và quan hệ (Q4, Q5)

| Trường hợp                        | Biểu diễn                                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Liên kết tới OC trong thư viện | `{ "type": "character", "characterId": "<uuid>" }`                                                                                                   |
| 2. Nhân vật chưa có hồ sơ         | `{ "type": "unlinked", "name": "Mẹ của Ngọc", "note"?: "…" }`                                                                                        |
| 3. Từng liên kết, OC đã bị xóa    | `{ "type": "unlinked", "name": "<tên lúc xóa>", "detachedFrom": { "characterId": "<uuid cũ>", "reason": "character_deleted", "at": "<ISO 8601>" } }` |

- **Xóa OC** (`detachDeletedCharacter`): mọi tham chiếu tới OC đó — trong quan hệ, sự kiện, và trường tùy chỉnh kiểu tham chiếu (kể cả trong object) — chuyển sang trường hợp 3. Loại quan hệ, trạng thái, mô tả, ghi chú được giữ nguyên. `detachedFrom.characterId` chỉ để lưu vết, **không** dùng để tự liên kết lại; không bao giờ tự liên kết với OC khác cùng tên. Hàm thuần, không đổi dữ liệu đầu vào; thời điểm `at` do caller truyền.
- **Quan hệ ngược** (`suggestReverseRelationships`): khi A có quan hệ liên kết tới B và B chưa có quan hệ nào liên kết tới A, hệ thống _có thể gợi ý_ tạo quan hệ ở B. Gợi ý chỉ gồm `fromCharacterId`, `fromItemId`, `toCharacterId` — **không** có loại, trạng thái hay mô tả; không tự tạo, không coi quan hệ là đối xứng.
- `collectLinkedReferences` liệt kê mọi tham chiếu liên kết (để TASK 03 tìm "ai đang tham chiếu tới B").

## 9. Dữ kiện nhạy cảm và AI (Q6)

- Định nghĩa trường và trường con có `sensitivity: "standard" | "sensitive"` (mặc định `standard`). Trường tùy chỉnh riêng và dùng chung đều đánh dấu được.
- Trường có sẵn nhạy cảm (SEN-01, đánh giá từng trường): `identity.biological_sex`, `background.family`, `psychology.wounds`, `psychology.emotional_triggers`, `psychology.coping_mechanisms`; trường con `appearance.scars.origin`. Các trường khác của nhóm `background` (nơi sinh, quê quán, môi trường trưởng thành, học vấn, đào tạo, điều kiện kinh tế, văn hóa) **không** mặc định nhạy cảm; `relationships.entries` (kể cả quan hệ gia đình) dùng độ nhạy cảm theo phần tử.
- **Theo từng phần tử (SEN-02):** envelope `specified` của trường danh sách (`text_list`, `character_ref_list`, `object_list`) có thể mang `sensitiveItemIds` — danh sách `id` phần tử người dùng đánh dấu nhạy cảm. Đây là **metadata**, nằm ngoài nội dung phần tử (AI không thể đọc nó như dữ kiện), được lưu/đọc/xuất/nhập cùng dữ kiện. Validation: chỉ trên trường danh sách, mỗi id phải tồn tại trong `value`, không trùng, mảng không rỗng.
- `selectFactsForAi(facts, { allowSensitive }, context)` trả về bản sao chỉ chứa dữ kiện được phép gửi, kèm danh sách `excluded`:
  - Mặc định **loại** mọi dữ kiện nhạy cảm, ở **mọi trạng thái** (kể cả `explicit_none`, `not_applicable`).
  - Chỉ đưa vào khi `allowSensitive` chứa khóa trường (mở cả trường, mọi phần tử và trường con) hoặc ref phần tử `field[itemId]` (chỉ mở phần tử đó, và chỉ khi bản thân trường **không** nhạy cảm — bảo vệ của trường cha luôn áp dụng trước). Quyền là **tham số của từng lần gọi**, không được đọc/ghi trong fact sheet ⇒ không tự duy trì sau một lần đồng ý. Có giá trị ≠ đồng ý.
  - **Kế thừa:** trường nhạy cảm ⇒ toàn bộ giá trị (mọi phần tử, mọi trường con). Trường con nhạy cảm ⇒ bị gỡ khỏi từng phần tử; phần tử không còn dữ kiện thì bị bỏ. Trường con nhạy cảm không được là `required`.
  - Dữ kiện không phân giải được định nghĩa ⇒ bị loại (không biết chính sách).
  - Định nghĩa của trường tùy chỉnh bị loại cũng bị gỡ khỏi bản sao (tránh lộ qua nhãn).
  - Phần tử được đánh dấu bị loại; các phần tử khác của cùng danh sách được giữ. Bản sao **không bao giờ** chứa `sensitiveItemIds`.
- **Fingerprint và nội dung lỗi thời:** `sensitiveItemIds` không phải nội dung nên **không** làm đổi fingerprint (đánh dấu nhạy cảm không làm nội dung "lỗi thời"). Thay vào đó, `findSensitiveRefs(refs, facts, context)` cho biết những dữ kiện mà một nội dung đã dùng nay **đã trở thành nhạy cảm** (trường, phần tử hoặc trường con) — để task AI đánh dấu nội dung cần xem lại về quyền riêng tư.

## 10. Trình bày: Cơ bản / Nâng cao và mẫu hồ sơ (Q7, Q12)

Trình bày **không bao giờ** chạm vào dữ kiện: ẩn trường không xóa giá trị, không biến nó thành `unspecified`; đổi chế độ không mất dữ liệu.

- `BASIC_FIELD_KEYS`: 31 trường có sẵn thường dùng (cột "Cơ bản"). Chế độ Nâng cao hiển thị mọi trường không deprecated. Trường tùy chỉnh (riêng hoặc dùng chung mà nhân vật đang dùng) luôn hiển thị.
- Nhóm/nhóm con thu gọn được là việc của editor; domain chỉ cung cấp nhóm của trường (`getFieldGroup`).
- `getFieldVisibility(key, { mode, template, facts, definitions })` → `visible` | `hidden_with_data` | `hidden`. Trường bị ẩn nhưng **đang có trạng thái lưu trữ** (kể cả `explicit_none`/`not_applicable`) trả về `hidden_with_data` để editor báo cho người dùng.
- **Contract mẫu hồ sơ** (`TemplatePresentation`, validate bằng `createTemplatePresentationSchema`):

```ts
type TemplatePresentation = {
  hiddenFields?: string[]; // ẩn trường có sẵn / dùng chung
  fieldOrder?: string[]; // thứ tự ưu tiên
  groupPlacement?: Record<string, string>; // trường → nhóm hiển thị (có sẵn hoặc dùng chung)
  libraryFields?: string[]; // trường dùng chung (lib.*) mà mẫu hiển thị
};
```

Mẫu **không thể** đổi khóa, đổi kiểu, chứa giá trị (schema strict từ chối mọi khóa khác), không tham chiếu trường riêng của một nhân vật (`custom.*`), không tham chiếu trường/nhóm không tồn tại.

## 11. Dữ kiện tùy chỉnh (Q1)

|                    | Riêng của nhân vật        | Dùng chung trong thư viện                                                                                                                 |
| ------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Khóa trường / nhóm | `custom.<id>` / `cg_<id>` | `lib.<id>` / `lg_<id>`                                                                                                                    |
| Nơi lưu            | `CharacterFacts.custom`   | Ngoài fact sheet (kho lưu trữ — TASK 03)                                                                                                  |
| Validate giá trị   | Tự chứa                   | Caller truyền `{ library }` vào `parseCharacterFacts(input, context)`; thiếu định nghĩa ⇒ lỗi "Thiếu định nghĩa dùng chung", không bỏ qua |
| Phiên bản          | —                         | `version` (số nguyên ≥ 1), tăng mỗi lần sửa                                                                                               |
| Nhóm được đặt vào  | Có sẵn, riêng, dùng chung | Có sẵn, dùng chung (không phụ thuộc nhóm của một nhân vật)                                                                                |

- **Phân giải theo tiền tố** (`createFieldResolver`): `custom.` → định nghĩa của nhân vật; `lib.` → định nghĩa thư viện truyền vào; còn lại → có sẵn. Một khóa không thể được hiểu thành hai định nghĩa; không có registry toàn cục.
- **Sửa định nghĩa** (`findBreakingChanges(prev, next)`): chỉ cho phép thay đổi tương thích trên cùng khóa — đổi nhãn, mô tả, nhóm, độ nhạy cảm; thêm lựa chọn, đơn vị, trường con tùy chọn; nới `min`/`max`; bật `allowOther`/`allowExplicitNone`. Thay đổi phá vỡ (đổi kiểu, bỏ lựa chọn/đơn vị/trường con, siết khoảng, bắt `integer`, thêm trường con bắt buộc, giảm `maxItems`, tắt `allowOther`/`allowExplicitNone`) phải bị từ chối hoặc tạo **định nghĩa mới với khóa mới**.
- Nếu một thay đổi phá vỡ vẫn lọt vào, validation **báo lỗi** giá trị cũ chứ không xóa — dữ liệu không bao giờ mất âm thầm.
- **Nhóm con**: `parent` trỏ tới một nhóm cấp 1. Không cho phép nhóm con của nhóm con.
- **Nhãn** của trường tùy chỉnh là nội dung người dùng — không dịch; lựa chọn và trường con phải có `label`.

## 12. Phiên bản schema và tương thích

|                      | v1 (TASK 02)              | v2 (TASK 02.1)                                                                      |
| -------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `schemaVersion`      | `1`                       | `2` (v3, TASK 03: + `sensitiveItemIds?` trong envelope `specified`)                 |
| Trạng thái           | specified, not_applicable | + `explicit_none`                                                                   |
| Ngôn ngữ nguồn       | —                         | `sourceLanguage?`                                                                   |
| Giới tính            | `identity.gender`         | `identity.gender_identity`, `identity.biological_sex`; `identity.gender` deprecated |
| Tham chiếu unlinked  | `name`, `note?`           | + `detachedFrom?`                                                                   |
| Định nghĩa tùy chỉnh | `custom.*`                | + `sensitivity?`, `allowExplicitNone?`; + phạm vi `lib.*` ngoài sheet               |

- **v3** chỉ thêm metadata tùy chọn `sensitiveItemIds`, nhưng vẫn tăng phiên bản vì schema strict của v2 sẽ từ chối thuộc tính này — dữ liệu v3 phải được nhận diện rõ ràng. SEN-01 (đổi độ nhạy cảm của định nghĩa có sẵn) không đổi cấu trúc dữ liệu.
- `parseCharacterFacts` chỉ nhận phiên bản hiện tại (v3). Dữ liệu cũ phải qua `migrateCharacterFacts(input, context)`:
  - `current` — đã là v3 hợp lệ.
  - `migrated` — v1/v2 → v3: sao chép nguyên vẹn, chỉ đổi `schemaVersion` (v1 ⊂ v2 ⊂ v3). Với nguồn v1 kèm danh sách `review`:
    - `ambiguous_gender` — có `identity.gender`; **không** tự chuyển sang trường mới.
    - `not_applicable_may_mean_none` — `not_applicable` ở trường nay cho phép `explicit_none`; **không** tự đổi.
  - `rejected` — không phải object, phiên bản không hỗ trợ, dữ liệu tự nhận là phiên bản cũ nhưng chứa tính năng của phiên bản sau, hoặc dữ liệu nguồn không hợp lệ (kèm `issues`; không sửa hộ).
- Trong database, `schema_version` là cột riêng; repository migrate **trong bộ nhớ** khi đọc (không ghi) và lưu phiên bản hiện tại ở lần cập nhật kế tiếp — xem `docs/database-migrations.md`.
- Đầu vào không bao giờ bị thay đổi.

## 13. Truy vết và phát hiện thay đổi (Q10)

Chi tiết: [character-domain-decisions.md § 4](./character-domain-decisions.md#4-traceability-và-change-detection-q10).

- `computeFactFingerprints(facts, context)` → `{ factRef: "c53:<hash>" }` cho `displayName`, mỗi trường có trạng thái lưu trữ, và mỗi phần tử lặp lại.
- Với trường tùy chỉnh / dùng chung, fingerprint gồm cả **ngữ nghĩa định nghĩa** (nhãn, mô tả, kiểu, lựa chọn…) — đổi nhãn "Màu yêu thích" thành "Màu ghét" làm nội dung cũ lỗi thời. Đổi nhóm, độ nhạy cảm, `version` thì không.
- `createFactSnapshot(current, scope)` ghi lại phạm vi dữ kiện đã cung cấp + fingerprint; `assessFactSnapshot(snapshot, current)` → `fresh` | `outdated { changed, removed, added }` | `incomparable` (khác thuật toán).
- Dữ kiện **mới được thêm vào phạm vi** (ví dụ vừa nhập màu mắt) cũng làm nội dung `outdated`.
- Fingerprint khác thuật toán **không bao giờ** được so sánh trực tiếp; `findStaleRefs` coi chúng là lỗi thời (thận trọng).
- Metadata riêng tư (`sensitiveItemIds`) không thuộc nội dung nên không ảnh hưởng fingerprint; dùng `findSensitiveRefs` (mục 9) để phát hiện nội dung đã dùng dữ kiện nay trở thành nhạy cảm.

## 14. Trường hợp đặc biệt

| Tình huống                              | Cách biểu diễn                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Không có họ                             | `identity.family_name: { state: "explicit_none" }`                                         |
| Văn hóa/loài không có khái niệm họ      | `identity.family_name: { state: "not_applicable" }`                                        |
| Không biết ngày sinh                    | Bỏ trống `identity.birth_date` (unspecified)                                               |
| Biết ngày/tháng sinh, không biết năm    | `{ type: "calendar", month: 3, day: 14 }`                                                  |
| Lịch hư cấu / mốc tương đối             | `{ type: "text", text: "Đêm trăng non thứ ba của Kỷ Sương Mù" }`                           |
| Năm trước Công nguyên                   | `{ type: "calendar", year: -300 }`                                                         |
| Không quốc tịch (người không quốc tịch) | `identity.nationality: explicit_none`                                                      |
| Không thuộc hệ thống quốc gia           | `identity.nationality: not_applicable`                                                     |
| Bất tử / tuổi xấp xỉ                    | `identity.age: { value: 340, unit: "years", approximate: true }` + `identity.apparent_age` |
| Bản dạng giới ngoài danh sách           | `{ other: "…" }` (giữ nguyên văn)                                                          |
| Loài không có giới tính sinh học        | `identity.biological_sex: not_applicable`                                                  |
| Không có tóc                            | `appearance.hair_color: not_applicable`                                                    |
| Xác nhận không có hình xăm              | `appearance.tattoos: explicit_none`                                                        |
| Cánh, sừng, đuôi, bộ phận cơ khí        | `appearance.special_features` (danh sách)                                                  |
| Người thân chưa có hồ sơ                | `character_ref` loại `unlinked`                                                            |
| OC được tham chiếu bị xóa               | `unlinked` + `detachedFrom` (mục 8)                                                        |
| Sự kiện không có ngày                   | Bỏ `time` trong phần tử sự kiện                                                            |
| Quan hệ một chiều                       | Chỉ lưu ở nhân vật được nhập; chỉ _gợi ý_ chiều ngược                                      |

## 15. Ví dụ minh họa

> ⚠️ Dữ liệu minh họa, không phải dữ liệu người dùng. Bản đầy đủ:
> `src/features/characters/__tests__/fixtures/sample-characters.ts` (A — hiện đại, B — fantasy, C — tối giản, kèm thư viện mẫu)
> `historical-v1.ts` / `historical-v2.ts` (bản v1 của TASK 02 và v2 của TASK 02.1, dùng để kiểm tra migration).

**Character C — tối giản (hợp lệ, ngôn ngữ chưa biết):**

```json
{
  "schemaVersion": 3,
  "displayName": "Khải",
  "values": {
    "personality.core_traits": {
      "state": "specified",
      "value": [
        { "id": "trait_it_noi", "text": "Ít nói" },
        { "id": "trait_chu_dao", "text": "Chu đáo" }
      ]
    },
    "lifestyle.occupation": { "state": "specified", "value": "Sinh viên kiến trúc" }
  }
}
```

**Trích Character A — tên hiển thị độc lập, xác nhận không có, trường dùng chung, ba loại tham chiếu, một quan hệ nhạy cảm theo phần tử:**

```json
{
  "schemaVersion": 3,
  "displayName": "Ngọc",
  "sourceLanguage": "vi",
  "values": {
    "identity.full_name": { "state": "specified", "value": "Trần Bảo Ngọc" },
    "identity.gender_identity": { "state": "specified", "value": { "option": "woman" } },
    "identity.biological_sex": { "state": "specified", "value": { "option": "female" } },
    "appearance.scars": { "state": "explicit_none" },
    "lib.zodiac": { "state": "specified", "value": { "option": "cat" } },
    "relationships.entries": {
      "state": "specified",
      "value": [
        {
          "id": "rel_khai",
          "person": { "type": "character", "characterId": "c3a1e5f7-9b2d-4f6a-8e0c-2d4b6a8c0e1f" },
          "type": { "option": "friend" }
        },
        {
          "id": "rel_me",
          "person": { "type": "unlinked", "name": "Mẹ của Ngọc" },
          "type": { "option": "family" },
          "status": { "option": "strained" }
        },
        {
          "id": "rel_thay_lam",
          "person": {
            "type": "unlinked",
            "name": "Thầy Lâm",
            "detachedFrom": {
              "characterId": "5d2b9f40-8c1e-4a7b-b3d6-0e9f8a7c6b5d",
              "reason": "character_deleted",
              "at": "2026-09-30T08:15:00Z"
            }
          },
          "type": { "option": "mentor" }
        }
      ],
      "sensitiveItemIds": ["rel_me"]
    }
  }
}
```

**Định nghĩa dùng chung (truyền vào khi validate A):**

```json
{
  "groups": [{ "id": "lg_worldbuilding", "label": "Thế giới quan" }],
  "fields": [
    {
      "key": "lib.zodiac",
      "version": 2,
      "group": "identity",
      "label": "Con giáp",
      "kind": "single_select",
      "options": [
        { "code": "rat", "label": "Tý" },
        { "code": "cat", "label": "Mão" }
      ]
    },
    {
      "key": "lib.secret",
      "version": 1,
      "group": "lg_worldbuilding",
      "label": "Bí mật thầm kín",
      "kind": "long_text",
      "sensitivity": "sensitive"
    }
  ]
}
```

**Trích Character B — fantasy: không áp dụng, giá trị khác, trường riêng có trường con nhạy cảm:**

```json
{
  "schemaVersion": 3,
  "displayName": "Dạ Vân",
  "sourceLanguage": "vi",
  "values": {
    "identity.family_name": { "state": "not_applicable" },
    "identity.gender_identity": {
      "state": "specified",
      "value": { "other": "Không mang giới tính theo khái niệm của loài người" }
    },
    "identity.biological_sex": { "state": "not_applicable" },
    "appearance.piercings": { "state": "not_applicable" },
    "custom.spells": {
      "state": "specified",
      "value": [{ "id": "spell_veil", "name": "Màn sương bạc", "cost": 30 }]
    }
  },
  "custom": {
    "groups": [{ "id": "cg_magic", "label": "Phép thuật" }],
    "fields": [
      {
        "key": "custom.spells",
        "group": "cg_magic",
        "label": "Phép đã học",
        "kind": "object_list",
        "fields": [
          { "key": "name", "label": "Tên phép", "kind": "short_text", "required": true },
          { "key": "cost", "label": "Ma lực tiêu hao", "kind": "number", "min": 0 },
          {
            "key": "weakness",
            "label": "Điểm yếu",
            "kind": "long_text",
            "sensitivity": "sensitive"
          }
        ]
      }
    ]
  }
}
```

**Ví dụ không hợp lệ:**

| Dữ liệu                                                                                 | Lý do                                                           |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `"identity.nationality": { "state": "specified", "value": "" }`                         | `specified` nhưng rỗng                                          |
| `"identity.nationality": { "state": "unspecified" }`                                    | Không lưu unspecified tường minh                                |
| `"appearance.tattoos": { "state": "specified", "value": [] }`                           | Danh sách rỗng không có nghĩa "không có" — dùng `explicit_none` |
| `"appearance.height": { "state": "explicit_none" }`                                     | Trường không cho phép `explicit_none`                           |
| `"identity.age": { "state": "specified", "value": { "value": "27", "unit": "years" } }` | Số dạng chuỗi                                                   |
| `"appearance.height": { …, "value": { "value": 170, "unit": "kg" } }`                   | Đơn vị không thuộc trường                                       |
| `"identity.gender_identity": { …, "value": { "option": "Nữ" } }`                        | Dùng nhãn thay cho mã                                           |
| `"sourceLanguage": "en-us"`                                                             | Không ở dạng chuẩn BCP 47 (`en-US`)                             |
| `"lib.zodiac": …` khi không truyền định nghĩa thư viện                                  | Thiếu định nghĩa dùng chung                                     |
| `"schemaVersion": 1`                                                                    | Phải migrate trước                                              |
| Hai phần tử cùng `id` trong một danh sách                                               | ID phải duy nhất                                                |
| Khóa lạ ở bất kỳ cấp nào                                                                | Bị từ chối, không âm thầm bị xóa                                |

## 16. Ngôn ngữ giao diện và nhãn

- Dữ liệu chỉ chứa **khóa, mã và giá trị người dùng nhập** — không chứa nhãn có sẵn.
- Nhãn trường/nhóm/lựa chọn/đơn vị/trạng thái/chế độ nằm trong từ điển theo ngôn ngữ (`labels.vi.ts`); thêm ngôn ngữ = thêm file cùng cấu trúc `FactLabels`.
- Giá trị văn bản tự do được lưu nguyên văn; domain không dịch hay ghi đè. Ngôn ngữ hồ sơ xuất ra là tham số của tác vụ biên tập (task sau).
