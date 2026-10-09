# Character Fact Schema

> **Trạng thái:** Bản thiết kế TASK 02 — chờ người dùng duyệt. Các điểm còn mở nằm trong
> [character-domain-decisions.md](./character-domain-decisions.md#7-quyết-định-cần-người-dùng-xác-nhận).
> Mã nguồn tương ứng: `src/features/characters/domain/`.

## 1. Mục tiêu thiết kế

- Mô tả một nhân vật đủ chi tiết, như một con người: định danh, ngoại hình, tính cách, tâm lý, hành vi, xuất thân, cuộc sống, quá khứ, quan hệ.
- Dùng được cho mọi bối cảnh: hiện đại, lịch sử, fantasy, sci-fi, thế giới hư cấu (lịch riêng, chủng loài phi nhân loại, không có quốc tịch…).
- Mọi dữ kiện đều **tùy chọn**, trừ tên hiển thị.
- Cấu trúc rõ ràng để AI dùng làm **dữ kiện nguồn** và để kiểm tra kết quả biên tập.
- Mở rộng được bằng nhóm và trường tùy chỉnh.
- Mỗi dữ kiện có **địa chỉ ổn định** để truy vết và phát hiện nội dung lỗi thời.
- Lưu được dưới dạng JSON (PostgreSQL `jsonb`) ở TASK 03 mà không cần chuyển đổi.

## 2. Nguyên tắc nghiệp vụ

| Nguyên tắc                 | Cách mô hình đáp ứng                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single Source of Truth** | `CharacterFacts` là nguồn gốc duy nhất. Nội dung AI (task sau) chỉ _tham chiếu_ dữ kiện qua fact ref + fingerprint, không có đường ghi ngược vào `CharacterFacts`.                                                |
| **Strict Editing**         | Dữ kiện chưa nhập không tồn tại trong `values` ⇒ không có gì để AI "điền". Các trường như "Tác động", "Ý nghĩa hình xăm", "Phản ứng" chỉ có giá trị khi người dùng nhập. Không có trường nào được suy ra tự động. |
| **Optional Fields**        | Ba trạng thái `specified` / `unspecified` / `not_applicable` (mục 4).                                                                                                                                             |
| **Stable Identity**        | Khóa trường kỹ thuật bằng ASCII (`identity.age`), không phụ thuộc nhãn; phần tử lặp lại có `id` riêng (mục 6).                                                                                                    |
| **Không suy luận**         | Schema không có quan hệ phụ thuộc giữa trường (ví dụ tuổi ↔ ngày sinh, hoàn cảnh ↔ tính cách). Quan hệ nhân vật không tự sinh chiều ngược lại.                                                                    |

## 3. Cấu trúc tổng thể

```ts
type CharacterFacts = {
  schemaVersion: 1;
  displayName: string; // bắt buộc — tên hiển thị trong thư viện
  values: Record<FieldKey, FactValue>; // khóa vắng mặt = unspecified
  custom?: {
    // định nghĩa tùy chỉnh của nhân vật này
    groups: CustomGroupDefinition[];
    fields: CustomFieldDefinition[];
  };
};

type FactValue = { state: "specified"; value: FactData } | { state: "not_applicable" };
```

- **Định danh kỹ thuật của nhân vật** (`id`, thời điểm tạo/sửa…) thuộc về bản ghi lưu trữ ở TASK 03, không nằm trong fact sheet.
- `values` là một map **phẳng** theo khóa trường. Nhóm/nhóm con chỉ là cách hiển thị, được quy định trong _định nghĩa_ trường, không lồng trong dữ liệu ⇒ chuyển trường sang nhóm khác không làm thay đổi dữ liệu.
- Phân cấp tối đa: **Nhóm → Nhóm con → Trường → Trường con** (4 cấp). Trường con chỉ được là kiểu lá (_leaf_).

## 4. Trạng thái dữ kiện

| Trạng thái       | Lưu trữ                                | Ý nghĩa                                                                                   | Với AI                                                                 |
| ---------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `specified`      | `{ "state": "specified", "value": … }` | Đã có giá trị xác định, hợp lệ theo kiểu của trường.                                      | Được dùng làm dữ kiện nguồn.                                           |
| `unspecified`    | **Không có khóa** trong `values`       | Chưa nhập / chưa quyết định.                                                              | Bỏ qua hoàn toàn, không được bịa.                                      |
| `not_applicable` | `{ "state": "not_applicable" }`        | Trường không áp dụng cho nhân vật (không có họ, không thuộc quốc gia nào, không có tóc…). | Có thể nêu rõ là không áp dụng nếu cần, nhưng không thay bằng giá trị. |

Quy tắc:

- `unspecified` **không bao giờ được lưu tường minh** — chỉ có một cách biểu diễn "chưa nhập". `{ "state": "unspecified" }` bị từ chối.
- `specified` luôn phải kèm `value` hợp lệ: chuỗi rỗng / toàn khoảng trắng, `null`, danh sách rỗng, phần tử không có dữ kiện ⇒ **không hợp lệ** (không tự hiểu là chưa xác định).
- `not_applicable` không được kèm `value`.
- Bên trong một phần tử lặp lại hoặc object, trường con vắng mặt = chưa xác định; trường con **không** có `not_applicable` (giữ dữ liệu gọn).

### 4.1. Chuyển dữ liệu nhập từ UI thành trạng thái

Thực hiện bởi `normalizeFactInput({ notApplicable, value })` **trước** khi validate:

| Dữ liệu nhập từ form                                                                     | Kết quả                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Bật "Không áp dụng" (bất kể giá trị)                                                     | `{ state: "not_applicable" }`                                                   |
| `undefined`, `null`, `""`, chỉ khoảng trắng                                              | unspecified (xóa khóa)                                                          |
| `[]`, hoặc danh sách mà mọi mục đều trống                                                | unspecified                                                                     |
| Object chỉ còn khóa cấu trúc (`id`, `type`, `unit`, `approximate`) sau khi bỏ phần trống | unspecified (ví dụ ô chiều cao có đơn vị nhưng không có số)                     |
| Chuỗi                                                                                    | `trim()` + chuẩn hóa Unicode NFC                                                |
| `false`, `0`                                                                             | **là giá trị thật** → `specified`                                               |
| Giá trị sai kiểu (ví dụ `NaN`)                                                           | giữ nguyên → `specified` → validation báo lỗi (không âm thầm thành unspecified) |
| Mục trống trong danh sách, trường con trống trong phần tử                                | bị loại bỏ; `id` của các mục còn lại giữ nguyên                                 |

Schema **không** trim hay chuẩn hóa: parse không bao giờ thay đổi dữ liệu.

## 5. Kiểu giá trị

| Kiểu (`kind`)        | Giá trị lưu trữ                                                                         | Ghi chú                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `short_text`         | `string`                                                                                | 1–300 ký tự, không toàn khoảng trắng.                                                                                                                                         |
| `long_text`          | `string`                                                                                | 1–20 000 ký tự.                                                                                                                                                               |
| `number`             | `number`                                                                                | Hữu hạn. Cấu hình: `integer`, `min`, `max`.                                                                                                                                   |
| `measure`            | `{ value: number, unit: string, approximate?: boolean }`                                | Giá trị có đơn vị. `unit` là mã ổn định thuộc danh sách của trường.                                                                                                           |
| `boolean`            | `boolean`                                                                               | `false` là giá trị hợp lệ.                                                                                                                                                    |
| `date`               | `{ type: "calendar", year?, month?, day?, approximate? }` hoặc `{ type: "text", text }` | Ngày từng phần (cần năm hoặc tháng; có ngày thì phải có tháng; kiểm tra ngày hợp lệ, 29/2 cho phép khi chưa biết năm; năm có thể âm). `text` cho lịch hư cấu / mốc tương đối. |
| `single_select`      | `{ option: code }` hoặc `{ other: string }`                                             | `other` chỉ khi trường cho phép. Mã lựa chọn ổn định, nhãn dịch được.                                                                                                         |
| `multi_select`       | `Choice[]`                                                                              | 1..100 lựa chọn, không trùng.                                                                                                                                                 |
| `text_list`          | `{ id, text }[]`                                                                        | Danh sách văn bản ngắn, mỗi mục có `id` ổn định.                                                                                                                              |
| `character_ref`      | `{ type: "character", characterId: uuid }` hoặc `{ type: "unlinked", name, note? }`     | Nhân vật trong thư viện hoặc nhân vật chỉ mô tả bằng văn bản.                                                                                                                 |
| `character_ref_list` | `{ id, ref: CharacterRef }[]`                                                           | Không trùng cùng một nhân vật thư viện.                                                                                                                                       |
| `object`             | `{ [subKey]: LeafValue }`                                                               | Object có cấu trúc (một giá trị). Chỉ cho trường tùy chỉnh ở phiên bản này.                                                                                                   |
| `object_list`        | `{ id, [subKey]: LeafValue }[]`                                                         | Danh sách object có cấu trúc. Mỗi phần tử ≥ 1 dữ kiện, trường con `required` phải có.                                                                                         |

_Leaf kinds_ = mọi kiểu trừ `object`, `object_list`. Trường con của object chỉ được dùng leaf kinds ⇒ không có lồng vô hạn.

Giới hạn chung: `text_list`/`character_ref_list` ≤ 200 mục; `object_list` ≤ 200 phần tử (sự kiện: ≤ 500); trường con ≤ 30; lựa chọn ≤ 100; nhóm tùy chỉnh ≤ 30; trường tùy chỉnh ≤ 200. Giới hạn độ dài tính theo ký tự (code unit UTF-16), không theo byte.

## 6. Định danh ổn định

| Đối tượng            | Định dạng                                                   | Ví dụ                           | Quy tắc                                                                                           |
| -------------------- | ----------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Nhóm có sẵn          | `group` / `group.sub`                                       | `appearance`, `appearance.hair` | Cố định trong code.                                                                               |
| Trường có sẵn        | `group.name` (snake_case ASCII)                             | `identity.birth_date`           | Không bao giờ đổi tên hay tái sử dụng. Muốn bỏ trường ⇒ migration + tăng `schemaVersion`.         |
| Nhóm tùy chỉnh       | `cg_<id>`                                                   | `cg_magic`                      | Sinh một lần khi tạo.                                                                             |
| Trường tùy chỉnh     | `custom.<id>`                                               | `custom.spells`                 | Sinh một lần; đổi nhãn không đổi khóa.                                                            |
| Trường con           | snake_case, duy nhất trong trường cha; `id` được dành riêng | `title`, `person`               |                                                                                                   |
| Mã lựa chọn / đơn vị | snake_case ASCII                                            | `romantic_partner`, `cm`        | Không phụ thuộc bản dịch.                                                                         |
| Phần tử lặp lại      | `[A-Za-z0-9_-]{1,64}`, duy nhất trong danh sách             | `evt_2f9c…`                     | Sinh phía client (khuyến nghị `crypto.randomUUID()`); không đổi khi sửa nội dung hay sắp xếp lại. |
| Nhân vật thư viện    | UUID                                                        | `0b5c4a6e-…`                    | Do TASK 03 cấp.                                                                                   |

**Fact ref** (địa chỉ dữ kiện dùng cho truy vết): `displayName`, `<fieldKey>`, `<fieldKey>[<itemId>]` — ví dụ `history.events[evt_len_da_lat]`.

## 7. Danh sách nhóm và trường mặc định

Thống kê: **9 nhóm, 6 nhóm con, 85 trường, 35 trường con**. Mọi trường đều nhận được 3 trạng thái `specified` / `unspecified` / `not_applicable`. Cột "Số lượng": _Một_ = một giá trị, _Nhiều_ = danh sách có id ổn định (khi `specified` phải có ≥ 1 phần tử). Thứ tự trong bảng là thứ tự hiển thị mặc định.

Nhãn ở đây là bản tiếng Việt (`labels.vi.ts`); dữ liệu không lưu nhãn.

### Định danh — `identity`

| Khóa                    | Nhãn             | Kiểu            | Số lượng     | Ràng buộc                                                                                             |
| ----------------------- | ---------------- | --------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `identity.full_name`    | Họ tên đầy đủ    | `short_text`    | Một          | ≤ 300 ký tự                                                                                           |
| `identity.given_name`   | Tên              | `short_text`    | Một          | ≤ 300 ký tự                                                                                           |
| `identity.family_name`  | Họ               | `short_text`    | Một          | ≤ 300 ký tự                                                                                           |
| `identity.common_name`  | Tên thường gọi   | `short_text`    | Một          | ≤ 300 ký tự                                                                                           |
| `identity.nicknames`    | Biệt danh        | `text_list`     | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất                                                           |
| `identity.other_names`  | Tên khác         | `object_list`   | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện                                                   |
| ↳ `name`                | Tên              | `short_text`    | Một          | **bắt buộc trong phần tử**; ≤ 300 ký tự                                                               |
| ↳ `context`             | Bối cảnh sử dụng | `short_text`    | Một          | ≤ 300 ký tự                                                                                           |
| `identity.age`          | Tuổi             | `measure`       | Một          | đơn vị: `years`, `months`; ≥ 0; cho phép `approximate`                                                |
| `identity.apparent_age` | Tuổi trông như   | `short_text`    | Một          | ≤ 300 ký tự                                                                                           |
| `identity.birth_date`   | Ngày sinh        | `date`          | Một          | ngày lịch từng phần hoặc văn bản tự do                                                                |
| `identity.gender`       | Giới tính        | `single_select` | Một          | lựa chọn: `female` (Nữ), `male` (Nam), `non_binary` (Phi nhị nguyên); cho phép giá trị khác (`other`) |
| `identity.pronouns`     | Đại từ xưng hô   | `short_text`    | Một          | ≤ 300 ký tự                                                                                           |
| `identity.nationality`  | Quốc tịch        | `short_text`    | Một          | ≤ 300 ký tự                                                                                           |
| `identity.species`      | Chủng loài       | `short_text`    | Một          | ≤ 300 ký tự                                                                                           |
| `identity.languages`    | Ngôn ngữ sử dụng | `text_list`     | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất                                                           |

### Ngoại hình — `appearance`

| Khóa                  | Nhãn                | Kiểu        | Số lượng | Ràng buộc      |
| --------------------- | ------------------- | ----------- | -------- | -------------- |
| `appearance.overview` | Ngoại hình tổng thể | `long_text` | Một      | ≤ 20 000 ký tự |
| `appearance.voice`    | Giọng nói           | `long_text` | Một      | ≤ 20 000 ký tự |

#### Vóc dáng — `appearance.body`

| Khóa                          | Nhãn         | Kiểu         | Số lượng | Ràng buộc                                                  |
| ----------------------------- | ------------ | ------------ | -------- | ---------------------------------------------------------- |
| `appearance.height`           | Chiều cao    | `measure`    | Một      | đơn vị: `cm`, `m`, `in`, `ft`; ≥ 0; cho phép `approximate` |
| `appearance.weight`           | Cân nặng     | `measure`    | Một      | đơn vị: `kg`, `lb`; ≥ 0; cho phép `approximate`            |
| `appearance.build`            | Vóc dáng     | `short_text` | Một      | ≤ 300 ký tự                                                |
| `appearance.body_proportions` | Tỉ lệ cơ thể | `long_text`  | Một      | ≤ 20 000 ký tự                                             |

#### Làn da — `appearance.skin`

| Khóa                      | Nhãn       | Kiểu         | Số lượng | Ràng buộc   |
| ------------------------- | ---------- | ------------ | -------- | ----------- |
| `appearance.skin_tone`    | Màu da     | `short_text` | Một      | ≤ 300 ký tự |
| `appearance.skin_texture` | Kết cấu da | `short_text` | Một      | ≤ 300 ký tự |

#### Gương mặt — `appearance.face`

| Khóa                     | Nhãn                | Kiểu         | Số lượng | Ràng buộc      |
| ------------------------ | ------------------- | ------------ | -------- | -------------- |
| `appearance.face_shape`  | Hình dáng gương mặt | `short_text` | Một      | ≤ 300 ký tự    |
| `appearance.eye_color`   | Màu mắt             | `short_text` | Một      | ≤ 300 ký tự    |
| `appearance.eye_details` | Đặc điểm mắt        | `long_text`  | Một      | ≤ 20 000 ký tự |
| `appearance.eyebrows`    | Lông mày            | `short_text` | Một      | ≤ 300 ký tự    |
| `appearance.nose`        | Mũi                 | `short_text` | Một      | ≤ 300 ký tự    |
| `appearance.lips`        | Môi                 | `short_text` | Một      | ≤ 300 ký tự    |

#### Mái tóc — `appearance.hair`

| Khóa                      | Nhãn        | Kiểu         | Số lượng | Ràng buộc   |
| ------------------------- | ----------- | ------------ | -------- | ----------- |
| `appearance.hair_color`   | Màu tóc     | `short_text` | Một      | ≤ 300 ký tự |
| `appearance.hair_length`  | Độ dài tóc  | `short_text` | Một      | ≤ 300 ký tự |
| `appearance.hair_style`   | Kiểu tóc    | `short_text` | Một      | ≤ 300 ký tự |
| `appearance.hair_texture` | Kết cấu tóc | `short_text` | Một      | ≤ 300 ký tự |

#### Dấu hiệu nhận dạng — `appearance.marks`

| Khóa                           | Nhãn                    | Kiểu          | Số lượng     | Ràng buộc                                           |
| ------------------------------ | ----------------------- | ------------- | ------------ | --------------------------------------------------- |
| `appearance.tattoos`           | Hình xăm                | `object_list` | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện |
| ↳ `description`                | Mô tả                   | `long_text`   | Một          | ≤ 20 000 ký tự                                      |
| ↳ `location`                   | Vị trí                  | `short_text`  | Một          | ≤ 300 ký tự                                         |
| ↳ `meaning`                    | Ý nghĩa                 | `long_text`   | Một          | ≤ 20 000 ký tự                                      |
| `appearance.scars`             | Sẹo                     | `object_list` | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện |
| ↳ `description`                | Mô tả                   | `long_text`   | Một          | ≤ 20 000 ký tự                                      |
| ↳ `location`                   | Vị trí                  | `short_text`  | Một          | ≤ 300 ký tự                                         |
| ↳ `origin`                     | Nguồn gốc               | `long_text`   | Một          | ≤ 20 000 ký tự                                      |
| `appearance.piercings`         | Khuyên xỏ               | `object_list` | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện |
| ↳ `location`                   | Vị trí                  | `short_text`  | Một          | ≤ 300 ký tự                                         |
| ↳ `description`                | Mô tả                   | `short_text`  | Một          | ≤ 300 ký tự                                         |
| `appearance.identifying_marks` | Dấu hiệu nhận dạng khác | `object_list` | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện |
| ↳ `description`                | Mô tả                   | `long_text`   | Một          | ≤ 20 000 ký tự                                      |
| ↳ `location`                   | Vị trí                  | `short_text`  | Một          | ≤ 300 ký tự                                         |
| `appearance.special_features`  | Đặc điểm đặc biệt       | `object_list` | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện |
| ↳ `name`                       | Đặc điểm                | `short_text`  | Một          | **bắt buộc trong phần tử**; ≤ 300 ký tự             |
| ↳ `description`                | Mô tả                   | `long_text`   | Một          | ≤ 20 000 ký tự                                      |

#### Phong cách — `appearance.style`

| Khóa                        | Nhãn                  | Kiểu          | Số lượng     | Ràng buộc                                           |
| --------------------------- | --------------------- | ------------- | ------------ | --------------------------------------------------- |
| `appearance.clothing_style` | Phong cách trang phục | `long_text`   | Một          | ≤ 20 000 ký tự                                      |
| `appearance.accessories`    | Phụ kiện              | `object_list` | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện |
| ↳ `name`                    | Phụ kiện              | `short_text`  | Một          | **bắt buộc trong phần tử**; ≤ 300 ký tự             |
| ↳ `description`             | Mô tả                 | `long_text`   | Một          | ≤ 20 000 ký tự                                      |

### Tính cách — `personality`

| Khóa                         | Nhãn                       | Kiểu        | Số lượng     | Ràng buộc                                   |
| ---------------------------- | -------------------------- | ----------- | ------------ | ------------------------------------------- |
| `personality.summary`        | Tổng quan tính cách        | `long_text` | Một          | ≤ 20 000 ký tự                              |
| `personality.core_traits`    | Đặc điểm tính cách chính   | `text_list` | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất |
| `personality.strengths`      | Ưu điểm                    | `text_list` | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất |
| `personality.weaknesses`     | Nhược điểm                 | `text_list` | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất |
| `personality.values`         | Giá trị sống               | `text_list` | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất |
| `personality.principles`     | Nguyên tắc cá nhân         | `text_list` | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất |
| `personality.likes`          | Điều yêu thích             | `text_list` | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất |
| `personality.dislikes`       | Điều không thích           | `text_list` | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất |
| `personality.contradictions` | Mâu thuẫn trong tính cách  | `text_list` | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất |
| `personality.social_manner`  | Cách ứng xử với người khác | `long_text` | Một          | ≤ 20 000 ký tự                              |

### Tâm lý — `psychology`

| Khóa                            | Nhãn                      | Kiểu          | Số lượng     | Ràng buộc                                           |
| ------------------------------- | ------------------------- | ------------- | ------------ | --------------------------------------------------- |
| `psychology.motivations`        | Động lực                  | `text_list`   | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất         |
| `psychology.goals`              | Mục tiêu                  | `text_list`   | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất         |
| `psychology.fears`              | Nỗi sợ                    | `text_list`   | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất         |
| `psychology.desires`            | Mong muốn                 | `text_list`   | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất         |
| `psychology.beliefs`            | Niềm tin                  | `text_list`   | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất         |
| `psychology.internal_conflicts` | Xung đột nội tâm          | `text_list`   | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất         |
| `psychology.wounds`             | Tổn thương tâm lý         | `object_list` | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện |
| ↳ `description`                 | Mô tả                     | `long_text`   | Một          | **bắt buộc trong phần tử**; ≤ 20 000 ký tự          |
| ↳ `note`                        | Ghi chú                   | `long_text`   | Một          | ≤ 20 000 ký tự                                      |
| `psychology.coping_mechanisms`  | Cách đối phó với áp lực   | `text_list`   | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất         |
| `psychology.emotional_triggers` | Yếu tố kích thích cảm xúc | `object_list` | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện |
| ↳ `trigger`                     | Yếu tố kích thích         | `short_text`  | Một          | **bắt buộc trong phần tử**; ≤ 300 ký tự             |
| ↳ `reaction`                    | Phản ứng                  | `long_text`   | Một          | ≤ 20 000 ký tự                                      |

### Hành vi và giao tiếp — `behavior`

| Khóa                             | Nhãn                           | Kiểu            | Số lượng     | Ràng buộc                                                                                                                                                                       |
| -------------------------------- | ------------------------------ | --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `behavior.habits`                | Thói quen                      | `text_list`     | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất                                                                                                                                     |
| `behavior.mannerisms`            | Cử chỉ đặc trưng               | `text_list`     | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất                                                                                                                                     |
| `behavior.demeanor`              | Phong thái                     | `long_text`     | Một          | ≤ 20 000 ký tự                                                                                                                                                                  |
| `behavior.stress_response`       | Phản ứng khi căng thẳng        | `long_text`     | Một          | ≤ 20 000 ký tự                                                                                                                                                                  |
| `behavior.speech_style`          | Cách nói chuyện                | `long_text`     | Một          | ≤ 20 000 ký tự                                                                                                                                                                  |
| `behavior.speech_pace`           | Tốc độ nói                     | `single_select` | Một          | lựa chọn: `very_slow` (Rất chậm), `slow` (Chậm), `moderate` (Vừa phải), `fast` (Nhanh), `very_fast` (Rất nhanh), `variable` (Thay đổi tùy lúc); cho phép giá trị khác (`other`) |
| `behavior.verbal_tics`           | Từ ngữ thường dùng             | `text_list`     | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất                                                                                                                                     |
| `behavior.emotional_expression`  | Cách thể hiện cảm xúc          | `long_text`     | Một          | ≤ 20 000 ký tự                                                                                                                                                                  |
| `behavior.situational_behaviors` | Ứng xử trong tình huống cụ thể | `object_list`   | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện                                                                                                                             |
| ↳ `situation`                    | Tình huống                     | `short_text`    | Một          | **bắt buộc trong phần tử**; ≤ 300 ký tự                                                                                                                                         |
| ↳ `behavior`                     | Cách ứng xử                    | `long_text`     | Một          | **bắt buộc trong phần tử**; ≤ 20 000 ký tự                                                                                                                                      |

### Xuất thân — `background`

| Khóa                         | Nhãn                       | Kiểu            | Số lượng | Ràng buộc                                                                                                                                                                 |
| ---------------------------- | -------------------------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background.birthplace`      | Nơi sinh                   | `short_text`    | Một      | ≤ 300 ký tự                                                                                                                                                               |
| `background.hometown`        | Quê quán                   | `short_text`    | Một      | ≤ 300 ký tự                                                                                                                                                               |
| `background.family`          | Hoàn cảnh gia đình         | `long_text`     | Một      | ≤ 20 000 ký tự                                                                                                                                                            |
| `background.upbringing`      | Môi trường trưởng thành    | `long_text`     | Một      | ≤ 20 000 ký tự                                                                                                                                                            |
| `background.education`       | Học vấn                    | `long_text`     | Một      | ≤ 20 000 ký tự                                                                                                                                                            |
| `background.training`        | Quá trình đào tạo          | `long_text`     | Một      | ≤ 20 000 ký tự                                                                                                                                                            |
| `background.economic_status` | Điều kiện kinh tế gia đình | `single_select` | Một      | lựa chọn: `poor` (Nghèo khó), `lower_income` (Thu nhập thấp), `middle_income` (Trung lưu), `upper_income` (Khá giả), `wealthy` (Giàu có); cho phép giá trị khác (`other`) |
| `background.culture`         | Bối cảnh văn hóa           | `long_text`     | Một      | ≤ 20 000 ký tự                                                                                                                                                            |

### Cuộc sống — `lifestyle`

| Khóa                          | Nhãn                  | Kiểu            | Số lượng     | Ràng buộc                                                                                                                                                  |
| ----------------------------- | --------------------- | --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifestyle.occupation`        | Nghề nghiệp           | `short_text`    | Một          | ≤ 300 ký tự                                                                                                                                                |
| `lifestyle.residence`         | Nơi ở                 | `short_text`    | Một          | ≤ 300 ký tự                                                                                                                                                |
| `lifestyle.living_conditions` | Điều kiện sống        | `long_text`     | Một          | ≤ 20 000 ký tự                                                                                                                                             |
| `lifestyle.daily_routine`     | Thói quen sinh hoạt   | `long_text`     | Một          | ≤ 20 000 ký tự                                                                                                                                             |
| `lifestyle.daily_activities`  | Hoạt động thường ngày | `text_list`     | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất                                                                                                                |
| `lifestyle.hobbies`           | Sở thích              | `text_list`     | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất                                                                                                                |
| `lifestyle.interests`         | Mối quan tâm cá nhân  | `text_list`     | Nhiều (1..N) | mỗi mục ≤ 300 ký tự, ≤ 200 mục, id duy nhất                                                                                                                |
| `lifestyle.skills`            | Kỹ năng               | `object_list`   | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện                                                                                                        |
| ↳ `name`                      | Kỹ năng               | `short_text`    | Một          | **bắt buộc trong phần tử**; ≤ 300 ký tự                                                                                                                    |
| ↳ `proficiency`               | Mức độ thành thạo     | `single_select` | Một          | lựa chọn: `novice` (Mới bắt đầu), `competent` (Cơ bản), `proficient` (Thành thạo), `expert` (Chuyên sâu), `master` (Bậc thầy); không cho phép giá trị khác |
| ↳ `note`                      | Ghi chú               | `long_text`     | Một          | ≤ 20 000 ký tự                                                                                                                                             |

### Quá khứ và sự kiện — `history`

| Khóa             | Nhãn               | Kiểu                 | Số lượng     | Ràng buộc                                           |
| ---------------- | ------------------ | -------------------- | ------------ | --------------------------------------------------- |
| `history.events` | Sự kiện            | `object_list`        | Nhiều (1..N) | ≤ 500 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện |
| ↳ `title`        | Tiêu đề            | `short_text`         | Một          | **bắt buộc trong phần tử**; ≤ 300 ký tự             |
| ↳ `time`         | Thời điểm          | `date`               | Một          | ngày lịch từng phần hoặc văn bản tự do              |
| ↳ `description`  | Mô tả              | `long_text`          | Một          | ≤ 20 000 ký tự                                      |
| ↳ `involved`     | Nhân vật liên quan | `character_ref_list` | Nhiều (1..N) | không trùng nhân vật thư viện                       |
| ↳ `impact`       | Tác động / hậu quả | `long_text`          | Một          | ≤ 20 000 ký tự                                      |

### Quan hệ nhân vật — `relationships`

| Khóa                    | Nhãn            | Kiểu            | Số lượng     | Ràng buộc                                                                                                                                                                                                                                                                                             |
| ----------------------- | --------------- | --------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relationships.entries` | Các mối quan hệ | `object_list`   | Nhiều (1..N) | ≤ 200 phần tử, id duy nhất, mỗi phần tử ≥ 1 dữ kiện                                                                                                                                                                                                                                                   |
| ↳ `person`              | Nhân vật        | `character_ref` | Một          | **bắt buộc trong phần tử**                                                                                                                                                                                                                                                                            |
| ↳ `type`                | Loại quan hệ    | `single_select` | Một          | lựa chọn: `family` (Gia đình), `romantic_partner` (Người yêu / bạn đời), `friend` (Bạn bè), `rival` (Đối thủ), `enemy` (Kẻ thù), `mentor` (Người dẫn dắt), `mentee` (Người được dẫn dắt), `colleague` (Đồng nghiệp), `ally` (Đồng minh), `acquaintance` (Người quen); cho phép giá trị khác (`other`) |
| ↳ `status`              | Trạng thái      | `single_select` | Một          | lựa chọn: `ongoing` (Đang duy trì), `strained` (Căng thẳng), `estranged` (Xa cách), `ended` (Đã kết thúc); cho phép giá trị khác (`other`)                                                                                                                                                            |
| ↳ `description`         | Mô tả quan hệ   | `long_text`     | Một          | ≤ 20 000 ký tự                                                                                                                                                                                                                                                                                        |
| ↳ `notes`               | Ghi chú         | `long_text`     | Một          | ≤ 20 000 ký tự                                                                                                                                                                                                                                                                                        |

## 8. Dữ kiện tùy chỉnh

Định nghĩa tùy chỉnh nằm trong `custom` của từng fact sheet (phạm vi theo nhân vật — xem câu hỏi Q1 trong tài liệu quyết định).

```ts
type CustomGroupDefinition = { id: "cg_…"; label: string; parent?: GroupId };
type CustomFieldDefinition = FieldConfig & {
  key: "custom.…";
  group: GroupId;
  label: string;
  description?: string;
};
```

- **Nhóm mới**: nhóm tùy chỉnh không có `parent`.
- **Nhóm con**: `parent` trỏ tới một nhóm cấp 1 (có sẵn hoặc tùy chỉnh). Không cho phép nhóm con của nhóm con.
- **Trường mới**: đặt trong bất kỳ nhóm/nhóm con nào (có sẵn hoặc tùy chỉnh). Trong nhóm có sẵn, trường tùy chỉnh hiển thị sau các trường có sẵn.
- **Kiểu dữ liệu**: tất cả các kiểu ở mục 5. `object`/`object_list` cần `fields` (trường con kiểu lá, có `label`).
- **Thứ tự hiển thị**: thứ tự mảng `groups` / `fields`.
- **Nhãn**: do người dùng nhập, là nội dung của người dùng — không dịch. Lựa chọn của select tùy chỉnh phải có `label`.
- **Validation định nghĩa**: khóa/ID duy nhất, nhóm tồn tại, độ sâu nhóm, mã lựa chọn duy nhất, `min ≤ max`, không dùng khóa con `id`.
- **Validation giá trị**: giá trị của trường tùy chỉnh được kiểm tra đúng như trường có sẵn, theo định nghĩa của nó. Giá trị không có định nghĩa ⇒ lỗi.

## 9. Trường hợp đặc biệt

| Tình huống                           | Cách biểu diễn                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Không có họ                          | `identity.family_name: { state: "not_applicable" }`                                        |
| Không biết ngày sinh                 | Bỏ trống `identity.birth_date` (unspecified)                                               |
| Biết ngày/tháng sinh, không biết năm | `{ type: "calendar", month: 3, day: 14 }`                                                  |
| Lịch hư cấu / mốc tương đối          | `{ type: "text", text: "Đêm trăng non thứ ba của Kỷ Sương Mù" }`                           |
| Năm trước Công nguyên                | `{ type: "calendar", year: -300 }`                                                         |
| Không thuộc hệ thống quốc tịch       | `identity.nationality: not_applicable`                                                     |
| Bất tử / tuổi xấp xỉ                 | `identity.age: { value: 340, unit: "years", approximate: true }` + `identity.apparent_age` |
| Giới tính ngoài danh sách            | `{ other: "…" }` (giữ nguyên văn)                                                          |
| Không có tóc                         | `appearance.hair_color: not_applicable`                                                    |
| Cánh, sừng, đuôi, bộ phận cơ khí     | `appearance.special_features` (danh sách)                                                  |
| Người thân chưa có hồ sơ             | `character_ref` loại `unlinked`                                                            |
| Sự kiện không có ngày                | Bỏ `time` trong phần tử sự kiện                                                            |
| Quan hệ một chiều                    | Chỉ lưu ở nhân vật được nhập; không tự sinh chiều ngược lại                                |
| "Xác nhận là không có hình xăm"      | Hiện dùng `not_applicable` (xem câu hỏi Q3)                                                |

## 10. Ví dụ minh họa

> ⚠️ Dữ liệu minh họa, không phải dữ liệu người dùng. Bản đầy đủ: `src/features/characters/__tests__/fixtures/sample-characters.ts` (Character A — hiện đại, B — fantasy, C — tối giản).

**Character C — tối giản (hợp lệ):**

```json
{
  "schemaVersion": 1,
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

**Trích Character B — fantasy (trường không áp dụng, giá trị khác, dữ kiện tùy chỉnh):**

```json
{
  "schemaVersion": 1,
  "displayName": "Dạ Vân",
  "values": {
    "identity.family_name": { "state": "not_applicable" },
    "identity.age": {
      "state": "specified",
      "value": { "value": 340, "unit": "years", "approximate": true }
    },
    "identity.birth_date": {
      "state": "specified",
      "value": { "type": "text", "text": "Đêm trăng non thứ ba của Kỷ Sương Mù" }
    },
    "identity.gender": {
      "state": "specified",
      "value": { "other": "Không mang giới tính theo khái niệm của loài người" }
    },
    "appearance.special_features": {
      "state": "specified",
      "value": [{ "id": "feat_wings", "name": "Đôi cánh bướm đêm" }]
    },
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
          { "key": "cost", "label": "Ma lực tiêu hao", "kind": "number", "min": 0 }
        ]
      }
    ]
  }
}
```

**Trích Character A — quan hệ với OC trong thư viện và với nhân vật chưa có hồ sơ:**

```json
"relationships.entries": {
  "state": "specified",
  "value": [
    {
      "id": "rel_khai",
      "person": { "type": "character", "characterId": "c3a1e5f7-9b2d-4f6a-8e0c-2d4b6a8c0e1f" },
      "type": { "option": "friend" },
      "description": "Bạn thân từ thời đại học."
    },
    {
      "id": "rel_me",
      "person": { "type": "unlinked", "name": "Mẹ của Ngọc" },
      "type": { "option": "family" },
      "status": { "option": "strained" }
    }
  ]
}
```

**Ví dụ không hợp lệ:**

| Dữ liệu                                                                                 | Lý do                            |
| --------------------------------------------------------------------------------------- | -------------------------------- |
| `"identity.nationality": { "state": "specified", "value": "" }`                         | `specified` nhưng rỗng           |
| `"identity.nationality": { "state": "unspecified" }`                                    | Không lưu unspecified tường minh |
| `"identity.age": { "state": "specified", "value": { "value": "27", "unit": "years" } }` | Số dạng chuỗi                    |
| `"appearance.height": { …, "value": { "value": 170, "unit": "kg" } }`                   | Đơn vị không thuộc trường        |
| `"identity.gender": { …, "value": { "option": "Nữ" } }`                                 | Dùng nhãn thay cho mã            |
| Hai phần tử cùng `id` trong một danh sách                                               | ID phải duy nhất                 |
| `"identity.favorite_color": …`                                                          | Trường không có định nghĩa       |
| Khóa lạ ở bất kỳ cấp nào                                                                | Bị từ chối, không âm thầm bị xóa |

## 11. Truy vết và phát hiện thay đổi (tóm tắt)

Chi tiết và so sánh phương án: [character-domain-decisions.md § 4](./character-domain-decisions.md#4-traceability-và-change-detection).

- `computeFactFingerprints(facts)` → `{ factRef: fingerprint }` cho `displayName`, mỗi trường đã có trạng thái, và mỗi phần tử lặp lại.
- Nội dung do AI biên tập (task sau) lưu kèm fingerprint của các fact ref đã dùng.
- `findStaleRefs(used, current)` → các dữ kiện đã đổi/bị xóa ⇒ nội dung có thể lỗi thời.
- `diffFactFingerprints(before, after)` → `added` / `changed` / `removed`.
- Sắp xếp lại danh sách chỉ đổi fingerprint của trường, không đổi fingerprint từng phần tử.

## 12. Ngôn ngữ

- Dữ liệu chỉ chứa **khóa, mã và giá trị người dùng nhập** — không chứa nhãn có sẵn.
- Nhãn trường/nhóm/lựa chọn/đơn vị nằm trong từ điển theo ngôn ngữ (`labels.vi.ts`); thêm ngôn ngữ = thêm file cùng cấu trúc `FactLabels`.
- Giá trị văn bản tự do được lưu nguyên văn; không có bước dịch hay ghi đè nào trong domain. Ngôn ngữ của hồ sơ xuất ra là tham số của tác vụ biên tập (task sau), độc lập với ngôn ngữ giao diện.
