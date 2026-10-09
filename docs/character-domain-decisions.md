# Character Domain — Quyết định thiết kế

> **Trạng thái:** Đề xuất của TASK 02, **chưa được người dùng duyệt**. Mọi quyết định dưới đây là
> phương án được đề xuất và đã triển khai ở mức domain/validation để kiểm chứng; chúng có thể thay
> đổi sau khi trả lời các câu hỏi ở [mục 7](#7-quyết-định-cần-người-dùng-xác-nhận).
>
> Đặc tả trường: [character-fact-schema.md](./character-fact-schema.md). Mã: `src/features/characters/domain/`.

## 1. Biểu diễn dữ kiện

### Phương án đã cân nhắc

|                        | A. Object lồng theo nhóm           | B. Mỗi trường là object metadata đầy đủ                                     | **C. Map phẳng `fieldKey → { state, value }`** (chọn)                             |
| ---------------------- | ---------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Ví dụ                  | `{ identity: { age: 27 } }`        | `{ id, key, label, type, value, state, updatedAt, source… }` cho mọi trường | `{ "identity.age": { state: "specified", value: { value: 27, unit: "years" } } }` |
| 3 trạng thái           | Phải dùng `null`/sentinel ⇒ dễ lẫn | Có                                                                          | Có, gọn                                                                           |
| Đổi nhóm của trường    | Dữ liệu phải di chuyển             | Không                                                                       | Không                                                                             |
| Trường tùy chỉnh       | Khó (lồng theo nhóm động)          | Dễ                                                                          | Dễ (cùng một map)                                                                 |
| Kích thước / độ dễ đọc | Gọn nhất                           | Nặng, lặp metadata ở từng trường đơn giản                                   | Gọn, đọc được                                                                     |
| Kiểu dữ liệu tĩnh      | Tốt nhất                           | Yếu                                                                         | Trung bình — kiểm tra lúc chạy theo định nghĩa                                    |
| Truy vết               | Theo path (dễ vỡ)                  | Theo id                                                                     | Theo khóa trường + id phần tử                                                     |
| JSONB                  | Tốt                                | Tốt nhưng phình                                                             | Tốt                                                                               |

**Quyết định:** C. Metadata (kiểu, nhóm, nhãn, ràng buộc) nằm trong **định nghĩa** trường, không lặp lại trong dữ liệu. Envelope `{ state, value }` chỉ có 2 khóa — đủ để phân biệt trạng thái mà không biến trường đơn giản thành cấu trúc nặng.

**Đánh đổi:** TypeScript không biết `values["identity.age"]` là `Measure` ở compile time (map mở do có trường tùy chỉnh); an toàn kiểu được bảo đảm bằng validation runtime theo định nghĩa. `ValueOfKind` cho phép thu hẹp kiểu khi đã biết `kind`.

### Kiểu giá trị

- Giá trị đơn là JSON nguyên thủy (`string`, `number`, `boolean`) — không bọc thêm.
- Giá trị có đơn vị dùng `measure` `{ value, unit, approximate? }`; **không tự quy đổi đơn vị** (quy đổi là suy luận/biến đổi dữ kiện).
- Danh sách luôn là mảng phần tử có `id` (`text_list`, `character_ref_list`, `object_list`) — kể cả danh sách chuỗi đơn giản, vì cần định danh phần tử để truy vết.
  - Đánh đổi: `["Kiên nhẫn"]` gọn hơn `[{ id, text: "Kiên nhẫn" }]` nhưng không phân biệt được "sửa mục 1" với "xóa mục 1 + thêm mục mới", và sắp xếp lại sẽ làm mọi mục bị coi là thay đổi.
- `multi_select` **không** có id phần tử: mã lựa chọn tự nó đã là định danh ổn định.
- Ngày: `calendar` (từng phần) hoặc `text` — vì lịch hư cấu và mốc tương đối ("hai năm trước khi…") không thể ép vào ngày Gregorian, nhưng ngày thật nên có cấu trúc để kiểm tra hợp lệ.
- Lựa chọn: `{ option: code }` hoặc `{ other: text }` thay vì một chuỗi duy nhất, để không bao giờ nhầm mã với văn bản người dùng nhập.

### Giới hạn độ sâu

**Nhóm → Nhóm con → Trường → Trường con (kiểu lá).** Không có object trong object, không có danh sách object trong phần tử. Lý do: form editor chỉ cần hai dạng (trường đơn, danh sách thẻ), validation và đường dẫn lỗi đơn giản, đủ cho mọi trường mặc định. Nhu cầu sâu hơn được tách thành trường riêng (ví dụ sự kiện liên quan đến nhân vật dùng `character_ref_list` là kiểu lá).

## 2. Trạng thái dữ kiện

| Phương án                                                                  | Vấn đề                                                                                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `null` = chưa xác định, không có cách nói "không áp dụng"                  | Thiếu một trạng thái nghiệp vụ                                                                                    |
| Lưu cả `{ state: "unspecified" }`                                          | Hai cách biểu diễn cho cùng một ý (vắng mặt và tường minh) ⇒ so sánh, fingerprint, truy vấn đều phải xử lý cả hai |
| **Vắng mặt = unspecified; envelope cho specified / not_applicable** (chọn) | Một cách biểu diễn duy nhất cho mỗi trạng thái                                                                    |

Chuyển đổi từ UI do `normalizeFactInput` làm (trim, NFC, bỏ phần tử rỗng, rỗng ⇒ unspecified). Schema chỉ **kiểm tra**, không biến đổi — đảm bảo "parse không làm thay đổi dữ liệu" và lỗi nhập liệu không bị nuốt mất.

Trường con trong phần tử không có `not_applicable` — đánh đổi để giữ dữ liệu gọn; nếu cần, có thể bổ sung sau mà không phá dữ liệu cũ.

## 3. Định danh ổn định

| Phương án cho trường có sẵn                                          | Đánh giá                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| UUID cho mỗi trường                                                  | Ổn định nhưng khó đọc trong dữ liệu, log, prompt AI và test |
| Nhãn tiếng Việt                                                      | Bị cấm: đổi nhãn/dịch làm mất liên kết                      |
| **Khóa ASCII có ngữ nghĩa, bất biến** (`identity.birth_date`) (chọn) | Dễ đọc, ổn định; quy ước: không đổi tên, không tái sử dụng  |

- Tiền tố nhóm trong khóa chỉ để dễ đọc; khóa là chuỗi mờ (opaque). Nếu sau này chuyển trường sang nhóm khác, **giữ nguyên khóa**.
- Trường tùy chỉnh: `custom.<id>` sinh một lần; đổi nhãn không đổi khóa ⇒ không mất dữ liệu.
- Phần tử lặp lại: `id` sinh phía client khi tạo phần tử (khuyến nghị `crypto.randomUUID()`), giữ nguyên khi sửa nội dung hay sắp xếp lại. Chỉ cần duy nhất trong danh sách vì fact ref luôn kèm khóa trường.

## 4. Traceability và Change Detection

### Phương án 1 — Stable field path + revision

Địa chỉ dạng path (`appearance.tattoos[0].description`), mỗi lần lưu tăng `revision` (toàn sheet hoặc theo path).

- ➕ Đơn giản khi dữ liệu là cây cố định; revision tăng dần dễ hiểu.
- ➖ Path theo **chỉ số mảng** vỡ khi thêm/xóa/sắp xếp: xóa phần tử 0 làm mọi phần tử sau "đổi địa chỉ".
- ➖ Revision toàn sheet: mọi nội dung AI đều lỗi thời sau bất kỳ chỉnh sửa nào (quá nhạy).
- ➖ Revision theo path: phải lưu và cập nhật bộ đếm cho từng path ở mọi đường ghi (dễ sai, cần bảng/cột riêng); sửa rồi hoàn tác vẫn bị coi là thay đổi.

### Phương án 2 — Stable fact ID + revision/hash

Địa chỉ bằng ID ổn định (khóa trường, `id` phần tử); phát hiện thay đổi bằng revision hoặc hash nội dung.

- ➕ Địa chỉ không đổi khi thêm/xóa/sắp xếp.
- ➕ Với **hash**: không cần lưu trạng thái — tính lại từ dữ liệu hiện tại bất kỳ lúc nào; sửa rồi hoàn tác ⇒ không lỗi thời; chạy giống nhau ở client và server.
- ➖ Cần id cho phần tử lặp lại (đã có).
- ➖ Hash không cho biết _thứ tự_ thay đổi (không cần cho mục tiêu "có lỗi thời không").

### Quyết định: Phương án 2 — fact ref ổn định + fingerprint nội dung (không dùng revision cho truy vết)

- Fact ref: `displayName`, `<fieldKey>`, `<fieldKey>[<itemId>]`.
- Fingerprint = `c53:` + hash cyrb53 (53-bit) của JSON chuẩn hóa (sắp khóa, NFC, bỏ `undefined`). Hàm đồng bộ, thuần JS, không phụ thuộc Node `crypto`.
- Nội dung AI (task sau) lưu `{ factRef → fingerprint }` của các dữ kiện đã dùng. `findStaleRefs` so với fingerprint hiện tại.

| Thao tác                         | Kết quả                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sửa trường đơn                   | Fingerprint của trường đổi                                                                                                                                               |
| Sửa một phần tử                  | Fingerprint phần tử đó + trường cha đổi; phần tử khác giữ nguyên                                                                                                         |
| Thêm phần tử                     | Ref mới (`added`) + trường cha đổi                                                                                                                                       |
| Xóa phần tử                      | Ref biến mất (`removed`) + trường cha đổi ⇒ nội dung dùng phần tử đó bị lỗi thời                                                                                         |
| Sắp xếp lại                      | Chỉ trường cha đổi; nội dung chỉ dùng từng phần tử **không** bị lỗi thời, nội dung phụ thuộc thứ tự (ví dụ dòng thời gian) tham chiếu ref của trường nên **bị** lỗi thời |
| specified ↔ not_applicable ↔ xóa | Fingerprint trường đổi / biến mất                                                                                                                                        |
| Đổi nhãn trường tùy chỉnh        | Không đổi (nhãn không thuộc dữ kiện)                                                                                                                                     |
| Sửa rồi hoàn tác                 | Fingerprint trở lại như cũ ⇒ không lỗi thời                                                                                                                              |

Lưu ý:

- cyrb53 không phải hash bảo mật; xác suất trùng với vài trăm dữ kiện của một nhân vật là không đáng kể. Tiền tố thuật toán cho phép đổi sang SHA-256 (WebCrypto) sau này mà không hiểu nhầm fingerprint cũ.
- Nội dung có thể "thiếu" khi người dùng _thêm_ dữ kiện mới mà phần đó chưa dùng. Phát hiện bằng cách so tập ref trong phạm vi (ví dụ cả nhóm Ngoại hình) — để task AI quyết định phạm vi; `diffFactFingerprints` đã trả về `added`.
- Độ chi tiết truy vết dừng ở mức phần tử (không xuống trường con) — đủ để chỉ ra "sự kiện X đã đổi", tránh bùng nổ số ref.
- TASK 03 vẫn có thể thêm `revision` cấp bản ghi cho **optimistic locking** — mục đích khác, không dùng cho truy vết.

## 5. Dữ kiện tùy chỉnh

| Phương án phạm vi định nghĩa                             | Ưu                                                                  | Nhược                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Theo từng nhân vật** (đề xuất tạm thời, đã triển khai) | Tự chứa: fact sheet tự validate được; không ảnh hưởng nhân vật khác | Lặp định nghĩa khi nhiều nhân vật cùng thế giới dùng chung trường         |
| Toàn thư viện                                            | Dùng chung, nhất quán                                               | Sửa định nghĩa ảnh hưởng mọi nhân vật; cần migration dữ liệu khi đổi kiểu |
| Theo mẫu hồ sơ / bộ sưu tập                              | Khớp mô hình "thế giới"                                             | Phụ thuộc thiết kế Templates/Collections chưa có                          |

Kiến trúc hiện tại cho phép chuyển sang hai phương án sau: chỉ cần thay nguồn của `findFieldDefinition`. Xem Q1.

Validation đi kèm: khóa `custom.<id>`, nhóm `cg_<id>`, một cấp nhóm con, trường con chỉ kiểu lá, nhãn bắt buộc, giới hạn số lượng (30 nhóm, 200 trường, 30 trường con, 100 lựa chọn).

## 6. Validation layer

- **Zod 4, strict objects, không transform.** Khóa lạ bị từ chối thay vì bị xóa âm thầm; output parse === input (có test với dữ liệu bị đóng băng).
- **Kiểm tra theo định nghĩa lúc chạy:** `valueSchemaFor(definition)` dựng schema cho từng trường (có cache), `characterFactsSchema` duyệt `values` và gắn lỗi đúng path (`values.<key>.value.<index>.<sub>`), thuận tiện cho form ở TASK 04/05.
- **Types viết tay + kiểm tra tương thích lúc biên dịch** (`SchemaTypeChecks`): đọc types dễ hơn kiểu suy ra từ schema động, và lệch giữa hai bên làm `tsc` báo lỗi.
- **Domain độc lập:** chỉ phụ thuộc `zod`; test kiểm tra không import React/Next/Drizzle/pg/AI SDK/alias `@/`.
- **Thông báo lỗi tiếng Việt** đặt tập trung trong `schemas.ts` — cần chuyển sang cơ chế mã lỗi + dịch khi có i18n thật.
- **Không kiểm tra chéo giữa các trường** (tuổi ↔ ngày sinh, chiều cao ↔ vóc dáng…): đó là suy luận, có thể sai với nhân vật hư cấu.
- **Không kiểm tra sự tồn tại** của `characterId` trong thư viện: đó là việc của tầng lưu trữ (TASK 03).

### Ưu điểm tổng thể

- Mọi trường tùy chọn; ba trạng thái rõ ràng, một cách biểu diễn cho mỗi trạng thái.
- Bao phủ nhân vật hiện đại lẫn phi nhân loại mà không cần trường đặc thù cho từng thể loại.
- Dữ liệu gọn, đọc được, lưu thẳng vào JSONB, dùng thẳng làm đầu vào AI (khóa + mã + văn bản gốc).
- Truy vết ổn định khi thêm/xóa/sắp xếp; không cần lưu trạng thái phụ.
- Định nghĩa có cấu trúc đủ để sinh form tự động.

### Nhược điểm / rủi ro

- Kiểu tĩnh yếu hơn với `values` (bù bằng validation runtime).
- 85 trường mặc định — form đầy đủ có thể quá dài; cần chiến lược hiển thị (Q7).
- Định nghĩa tùy chỉnh theo nhân vật có thể bị lặp (Q1).
- Truy vấn SQL vào bên trong giá trị (ví dụ "nhân vật cao trên 180 cm") phức tạp hơn so với cột riêng — chấp nhận được với ứng dụng cá nhân.
- Đổi kiểu một trường tùy chỉnh đã có dữ liệu sẽ làm giá trị cũ không hợp lệ ⇒ editor tương lai phải chặn hoặc migrate.

## 7. Quyết định cần người dùng xác nhận

| #   | Câu hỏi                                                                                                                                                        | Đề xuất hiện tại                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Q1  | Định nghĩa trường/nhóm tùy chỉnh thuộc phạm vi nào: từng nhân vật, toàn thư viện, hay theo Mẫu hồ sơ / Bộ sưu tập?                                             | Từng nhân vật (đã triển khai), sẽ mở rộng theo Mẫu hồ sơ khi thiết kế Templates |
| Q2  | `displayName` độc lập hay tự lấy từ `identity.common_name` / `full_name`?                                                                                      | Độc lập, bắt buộc; UI có thể gợi ý từ trường tên                                |
| Q3  | Với trường danh sách (hình xăm, sẹo…), "đã xác nhận là không có" nên là `not_applicable`, hay cần trạng thái/biểu diễn riêng (ví dụ danh sách rỗng được phép)? | Dùng `not_applicable`                                                           |
| Q4  | Khi tạo quan hệ A → B (B là OC trong thư viện), UI có nên _gợi ý_ tạo quan hệ ngược ở B không? (Không bao giờ tự tạo.)                                         | Chỉ gợi ý, người dùng tự nhập                                                   |
| Q5  | Khi xóa một OC đang được nhân vật khác tham chiếu: chặn xóa, chuyển tham chiếu thành `unlinked` (giữ tên), hay để tham chiếu treo?                             | Chuyển thành `unlinked` với tên hiện tại — quyết định ở TASK 03                 |
| Q6  | Dữ kiện nhạy cảm (`psychology.wounds`, …) có cần đánh dấu để mặc định **không** gửi cho AI, hoặc cần xác nhận trước khi gửi?                                   | Chưa đánh dấu; cần quyết định trước task AI                                     |
| Q7  | 85 trường mặc định: editor nên hiển thị tất cả, hay có bộ "cơ bản" và bộ "mở rộng"? Có trường nào nên bỏ/thêm?                                                 | Giữ đủ trong domain; editor hiển thị theo nhóm thu gọn                          |
| Q8  | Giới tính: danh sách lựa chọn `female`/`male`/`non_binary` + "khác" có phù hợp? Có cần tách giới tính sinh học và bản dạng giới?                               | Một trường, cho phép "khác"                                                     |
| Q9  | Hồ sơ có cần ghi "ngôn ngữ của dữ kiện" (ví dụ dữ kiện viết bằng tiếng Việt) để AI biết ngôn ngữ nguồn?                                                        | Chưa có; thêm khi làm task AI                                                   |
| Q10 | Độ chi tiết truy vết ở mức phần tử (ví dụ cả sự kiện) có đủ, hay cần xuống trường con (`events[e1].impact`)?                                                   | Mức phần tử                                                                     |
| Q11 | Các giới hạn (300 / 20 000 ký tự, 200 phần tử, 500 sự kiện…) có phù hợp?                                                                                       | Như hiện tại                                                                    |
| Q12 | Mẫu hồ sơ (Templates) có được ẩn/hiện, đổi thứ tự trường có sẵn không, hay chỉ thêm trường tùy chỉnh?                                                          | Chưa quyết định — thuộc thiết kế Templates                                      |

## 8. Dành cho TASK 03 (chưa thực hiện)

Gợi ý, **không** phải quyết định đã chốt:

- Bảng `characters`: `id uuid`, `display_name text` (trùng `facts.displayName` hoặc chỉ lưu một nơi), `facts jsonb` (cả `values` và `custom`), `schema_version int`, `created_at`, `updated_at`, có thể `revision int` cho optimistic locking.
- Validate bằng `characterFactsSchema` ở mọi đường ghi (Server Actions); database không tự sửa dữ liệu.
- Tham chiếu nhân vật nằm trong JSONB nên không có foreign key — cân nhắc bảng phụ `character_references` (trích xuất khi lưu) để tìm "ai đang tham chiếu tới B" và xử lý Q5.
- Index: B-tree trên `display_name`; GIN trên `facts` nếu cần tìm kiếm.
- Migration dữ liệu theo `schemaVersion` khi cấu trúc thay đổi.
- Nơi lưu định nghĩa tùy chỉnh phụ thuộc Q1.
