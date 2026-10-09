/**
 * ⚠️ DỮ LIỆU MINH HỌA — ILLUSTRATIVE SAMPLE DATA ONLY.
 * Fictional characters written to exercise the Character Fact schema in tests and docs.
 * Not user data; must never be seeded into the database or shown as real content.
 */
import type { CharacterFacts } from "../../domain";

/** Fixed fake library ids so samples can reference each other. */
export const SAMPLE_CHARACTER_IDS = {
  contemporary: "0b5c4a6e-2f1d-4c1e-9a7b-3d2e1f0a9b8c",
  fantasy: "7e9d8c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
  minimal: "c3a1e5f7-9b2d-4f6a-8e0c-2d4b6a8c0e1f",
} as const;

/** Character A — contemporary, mostly human-scale facts, several fields left unspecified. */
export const sampleContemporary: CharacterFacts = {
  schemaVersion: 1,
  displayName: "Trần Bảo Ngọc",
  values: {
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
    "identity.gender": { state: "specified", value: { option: "female" } },
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
      ],
    },

    "relationships.entries": {
      state: "specified",
      value: [
        {
          id: "rel_khai",
          person: { type: "character", characterId: SAMPLE_CHARACTER_IDS.minimal },
          type: { option: "friend" },
          description: "Bạn thân từ thời đại học.",
        },
        {
          id: "rel_me",
          person: { type: "unlinked", name: "Mẹ của Ngọc", note: "Chưa có hồ sơ riêng." },
          type: { option: "family" },
          status: { option: "strained" },
        },
      ],
    },
    // Weight, eye colour, psychology, background… intentionally unspecified (absent).
  },
};

/** Character B — non-human fantasy: unusual anatomy, not-applicable fields, custom facts. */
export const sampleFantasy: CharacterFacts = {
  schemaVersion: 1,
  displayName: "Dạ Vân",
  values: {
    "identity.common_name": { state: "specified", value: "Dạ Vân" },
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
    "identity.gender": {
      state: "specified",
      value: { other: "Không mang giới tính theo khái niệm của loài người" },
    },
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
    ],
  },
};

/** Character C — minimal: a name and a couple of traits. Everything else unspecified. */
export const sampleMinimal: CharacterFacts = {
  schemaVersion: 1,
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
