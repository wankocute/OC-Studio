/**
 * ⚠️ DỮ LIỆU MINH HỌA — ILLUSTRATIVE SAMPLE DATA ONLY.
 * Fictional characters written to exercise the Character Fact schema (v3) in tests and docs.
 * Not user data; must never be seeded into the database or shown as real content.
 */
import type { CharacterFacts, DefinitionContext, LibraryDefinitions } from "../../domain";

/** Fixed fake library ids so samples can reference each other. */
export const SAMPLE_CHARACTER_IDS = {
  contemporary: "0b5c4a6e-2f1d-4c1e-9a7b-3d2e1f0a9b8c",
  fantasy: "7e9d8c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
  minimal: "c3a1e5f7-9b2d-4f6a-8e0c-2d4b6a8c0e1f",
  /** A character that was deleted from the library (referenced only via `detachedFrom`). */
  deleted: "5d2b9f40-8c1e-4a7b-b3d6-0e9f8a7c6b5d",
} as const;

/** Library-scoped definitions shared by several samples (Q1). */
export const sampleLibrary: LibraryDefinitions = {
  groups: [{ id: "lg_worldbuilding", label: "Thế giới quan" }],
  fields: [
    {
      key: "lib.zodiac",
      version: 2,
      group: "identity",
      label: "Con giáp",
      kind: "single_select",
      options: [
        { code: "rat", label: "Tý" },
        { code: "ox", label: "Sửu" },
        { code: "tiger", label: "Dần" },
        { code: "cat", label: "Mão" },
      ],
    },
    {
      key: "lib.secret",
      version: 1,
      group: "lg_worldbuilding",
      label: "Bí mật thầm kín",
      kind: "long_text",
      sensitivity: "sensitive",
    },
  ],
};

export const sampleContext: DefinitionContext = { library: sampleLibrary };

/**
 * Character A — contemporary. Linked, unlinked and detached relationships; explicit none;
 * a sensitive built-in fact; library fields; source language set.
 */
export const sampleContemporary: CharacterFacts = {
  schemaVersion: 3,
  displayName: "Ngọc",
  sourceLanguage: "vi",
  values: {
    // displayName ("Ngọc") deliberately differs from the full name (Q2).
    "identity.full_name": { state: "specified", value: "Trần Bảo Ngọc" },
    "identity.given_name": { state: "specified", value: "Ngọc" },
    "identity.family_name": { state: "specified", value: "Trần" },
    "identity.nicknames": {
      state: "specified",
      value: [
        { id: "nick_bong", text: "Bông" },
        { id: "nick_hoa_si", text: "Họa sĩ nhí" },
      ],
    },
    "identity.age": { state: "specified", value: { value: 27, unit: "years" } },
    // Birthday known, birth year deliberately not entered.
    "identity.birth_date": { state: "specified", value: { type: "calendar", month: 3, day: 14 } },
    "identity.gender_identity": { state: "specified", value: { option: "woman" } },
    "identity.biological_sex": { state: "specified", value: { option: "female" } },
    "identity.pronouns": { state: "specified", value: "chị / cô ấy" },
    "identity.nationality": { state: "specified", value: "Việt Nam" },
    "identity.species": { state: "specified", value: "Người" },
    "identity.languages": {
      state: "specified",
      value: [
        { id: "lang_vi", text: "Tiếng Việt" },
        { id: "lang_en", text: "Tiếng Anh (giao tiếp)" },
      ],
    },

    "appearance.height": { state: "specified", value: { value: 158, unit: "cm" } },
    "appearance.hair_color": { state: "specified", value: "Nâu hạt dẻ" },
    "appearance.hair_length": { state: "specified", value: "Ngang vai" },
    "appearance.tattoos": {
      state: "specified",
      value: [{ id: "tattoo_mai", description: "Một cành mai nhỏ", location: "Cổ tay trái" }],
    },
    // Confirmed: no scars (Q3) — different from "not entered" and from "not applicable".
    "appearance.scars": { state: "explicit_none" },
    "appearance.clothing_style": {
      state: "specified",
      value: "Áo len rộng, quần jean ống suông, luôn đeo tạp dề dính màu khi làm việc.",
    },

    "personality.core_traits": {
      state: "specified",
      value: [
        { id: "trait_kien_nhan", text: "Kiên nhẫn" },
        { id: "trait_ngai_xung_dot", text: "Ngại xung đột" },
      ],
    },
    "personality.strengths": {
      state: "specified",
      value: [{ id: "str_quan_sat", text: "Quan sát tỉ mỉ" }],
    },
    "personality.weaknesses": {
      state: "specified",
      value: [{ id: "weak_tu_choi", text: "Khó nói lời từ chối" }],
    },
    "personality.likes": {
      state: "specified",
      value: [
        { id: "like_mua", text: "Tiếng mưa trên mái tôn" },
        { id: "like_ca_phe", text: "Cà phê muối" },
      ],
    },

    // Sensitive built-in field (Q6): excluded from AI input unless allowed per request.
    "psychology.wounds": {
      state: "specified",
      value: [{ id: "wound_bo_roi_di", description: "Bố rời gia đình khi Ngọc lên mười." }],
    },

    "lifestyle.occupation": { state: "specified", value: "Họa sĩ minh họa tự do kiêm pha chế" },
    "lifestyle.residence": { state: "specified", value: "Một căn gác nhỏ ở Đà Lạt" },
    "lifestyle.hobbies": {
      state: "specified",
      value: [{ id: "hobby_ky_hoa", text: "Ký họa người lạ ở chợ đêm" }],
    },
    "lifestyle.skills": {
      state: "specified",
      value: [
        { id: "skill_mau_nuoc", name: "Vẽ màu nước", proficiency: { option: "expert" } },
        { id: "skill_pha_che", name: "Pha chế", proficiency: { option: "competent" } },
      ],
    },

    "history.events": {
      state: "specified",
      value: [
        {
          id: "evt_giai_thuong",
          title: "Đoạt giải tranh thiếu nhi cấp tỉnh",
          time: { type: "calendar", year: 2008, approximate: true },
        },
        {
          id: "evt_len_da_lat",
          title: "Chuyển lên Đà Lạt sống một mình",
          time: { type: "text", text: "Mùa hè sau khi tốt nghiệp đại học" },
          involved: [
            {
              id: "inv_khai",
              ref: { type: "character", characterId: SAMPLE_CHARACTER_IDS.minimal },
            },
          ],
        },
        {
          id: "evt_bo_roi_di",
          title: "Bố rời khỏi gia đình",
          time: { type: "text", text: "Năm Ngọc lên mười" },
        },
      ],
      // Per-item sensitivity (SEN-02): only this event is private; the others stay shareable.
      sensitiveItemIds: ["evt_bo_roi_di"],
    },

    "relationships.entries": {
      state: "specified",
      value: [
        {
          // 1. Linked to an OC in the library.
          id: "rel_khai",
          person: { type: "character", characterId: SAMPLE_CHARACTER_IDS.minimal },
          type: { option: "friend" },
          description: "Bạn thân từ thời đại học.",
        },
        {
          // 2. Unlinked: a character with no profile of their own.
          id: "rel_me",
          person: { type: "unlinked", name: "Mẹ của Ngọc", note: "Chưa có hồ sơ riêng." },
          type: { option: "family" },
          status: { option: "strained" },
        },
        {
          // 3. Detached: was linked to an OC that has since been deleted (Q5).
          id: "rel_thay_lam",
          person: {
            type: "unlinked",
            name: "Thầy Lâm",
            detachedFrom: {
              characterId: SAMPLE_CHARACTER_IDS.deleted,
              reason: "character_deleted",
              at: "2026-09-30T08:15:00Z",
            },
          },
          type: { option: "mentor" },
          description: "Thầy dạy vẽ đầu tiên.",
        },
      ],
      sensitiveItemIds: ["rel_me"],
    },

    // Library-scoped fields (Q1), resolved through `sampleContext`.
    "lib.zodiac": { state: "specified", value: { option: "cat" } },
    "lib.secret": { state: "specified", value: "Vẫn giữ bức thư chưa từng gửi cho bố." },
    // Weight, eye colour, background… intentionally unspecified (absent).
  },
};

/**
 * Character B — non-human fantasy: unusual anatomy, not-applicable fields, character-scoped
 * custom facts (one sensitive), gender identity outside the option list.
 */
export const sampleFantasy: CharacterFacts = {
  schemaVersion: 3,
  displayName: "Dạ Vân",
  sourceLanguage: "vi",
  values: {
    "identity.common_name": { state: "specified", value: "Dạ Vân" },
    // Spirits of this world have no concept of family names.
    "identity.family_name": { state: "not_applicable" },
    "identity.other_names": {
      state: "specified",
      value: [
        {
          id: "name_true",
          name: "Người Dệt Ánh Trăng",
          context: "Danh xưng trong các bài đồng dao",
        },
      ],
    },
    "identity.age": { state: "specified", value: { value: 340, unit: "years", approximate: true } },
    "identity.apparent_age": { state: "specified", value: "Khoảng mười bảy tuổi" },
    "identity.birth_date": {
      state: "specified",
      value: { type: "text", text: "Đêm trăng non thứ ba của Kỷ Sương Mù" },
    },
    "identity.gender_identity": {
      state: "specified",
      value: { other: "Không mang giới tính theo khái niệm của loài người" },
    },
    "identity.biological_sex": { state: "not_applicable" },
    "identity.pronouns": { state: "specified", value: "nó / người ấy" },
    "identity.nationality": { state: "not_applicable" },
    "identity.species": { state: "specified", value: "Tinh linh bướm đêm" },

    "appearance.height": { state: "specified", value: { value: 1.4, unit: "m" } },
    "appearance.skin_tone": { state: "specified", value: "Xám tro ánh bạc" },
    "appearance.hair_color": { state: "not_applicable" },
    "appearance.eye_details": {
      state: "specified",
      value: "Mắt kép đen tuyền, phản chiếu ánh sáng thành những đốm vàng nhỏ.",
    },
    "appearance.special_features": {
      state: "specified",
      value: [
        {
          id: "feat_wings",
          name: "Đôi cánh bướm đêm",
          description: "Sải cánh hơn hai mét, phủ vảy bạc, gấp lại như áo choàng khi đứng yên.",
        },
        { id: "feat_antennae", name: "Râu hình lông vũ" },
      ],
    },
    // Piercings do not apply to this body (Q3: not_applicable, not explicit_none).
    "appearance.piercings": { state: "not_applicable" },

    "personality.core_traits": {
      state: "specified",
      value: [
        { id: "trait_to_mo", text: "Tò mò" },
        { id: "trait_so_lua", text: "Sợ lửa nhưng bị ánh lửa thu hút" },
      ],
    },

    "custom.magic_element": { state: "specified", value: { option: "moon" } },
    "custom.mana_capacity": { state: "specified", value: 120 },
    "custom.spells": {
      state: "specified",
      value: [
        { id: "spell_veil", name: "Màn sương bạc", cost: 30 },
        {
          id: "spell_dream",
          name: "Dệt giấc mơ",
          description: "Chỉ dùng được với người đang ngủ.",
          weakness: "Mất tác dụng nếu người ngủ gọi đúng tên thật của Dạ Vân.",
        },
      ],
    },
    "custom.contract_holder": {
      state: "specified",
      value: { type: "unlinked", name: "Pháp sư Hàn Mặc" },
    },
    "custom.wing_pattern": {
      state: "specified",
      value: "Hoa văn hình mắt cú trên cánh sau, chỉ hiện rõ dưới ánh trăng.",
    },
    "custom.true_name": { state: "specified", value: "Lục Dạ Vân Thường" },
    // A library field that does not apply to this character.
    "lib.zodiac": { state: "not_applicable" },
  },
  custom: {
    groups: [
      { id: "cg_magic", label: "Phép thuật" },
      { id: "cg_moth_traits", label: "Đặc điểm loài bướm đêm", parent: "appearance" },
    ],
    fields: [
      {
        key: "custom.magic_element",
        group: "cg_magic",
        label: "Hệ phép",
        kind: "single_select",
        options: [
          { code: "moon", label: "Nguyệt" },
          { code: "shadow", label: "Bóng tối" },
        ],
      },
      {
        key: "custom.mana_capacity",
        group: "cg_magic",
        label: "Dung lượng ma lực",
        kind: "number",
        integer: true,
        min: 0,
      },
      {
        key: "custom.spells",
        group: "cg_magic",
        label: "Phép đã học",
        kind: "object_list",
        fields: [
          { key: "name", label: "Tên phép", kind: "short_text", required: true },
          { key: "cost", label: "Ma lực tiêu hao", kind: "number", min: 0 },
          { key: "description", label: "Mô tả", kind: "long_text" },
          { key: "weakness", label: "Điểm yếu", kind: "long_text", sensitivity: "sensitive" },
        ],
      },
      {
        key: "custom.contract_holder",
        group: "relationships",
        label: "Người giữ khế ước",
        kind: "character_ref",
      },
      {
        key: "custom.wing_pattern",
        group: "cg_moth_traits",
        label: "Hoa văn trên cánh",
        kind: "long_text",
      },
      {
        key: "custom.true_name",
        group: "identity",
        label: "Tên thật",
        kind: "short_text",
        sensitivity: "sensitive",
      },
    ],
  },
};

/** Character C — minimal: a name and a couple of traits. Language unknown, nothing else set. */
export const sampleMinimal: CharacterFacts = {
  schemaVersion: 3,
  displayName: "Khải",
  values: {
    "personality.core_traits": {
      state: "specified",
      value: [
        { id: "trait_it_noi", text: "Ít nói" },
        { id: "trait_chu_dao", text: "Chu đáo" },
      ],
    },
    "lifestyle.occupation": { state: "specified", value: "Sinh viên kiến trúc" },
  },
};

export const sampleCharacters = {
  contemporary: sampleContemporary,
  fantasy: sampleFantasy,
  minimal: sampleMinimal,
} as const;
