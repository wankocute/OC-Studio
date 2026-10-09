/**
 * Zod schemas for Character Facts.
 *
 * Rules:
 * - Parsing never changes data: objects are strict (unknown keys are rejected, not stripped)
 *   and there are no transforms. Normalisation (trimming, blank → unspecified) happens
 *   before validation, in `normalizeFactInput`.
 * - Field values are validated against their definition (built-in or custom) at runtime,
 *   since the set of fields is open-ended.
 */
import { z } from "zod";

import { getBuiltinField, getBuiltinGroup, optionCodes } from "./definitions";
import type {
  CharacterFacts,
  CharacterRef,
  Choice,
  CustomDefinitions,
  CustomFieldDefinition,
  CustomGroupDefinition,
  FactValue,
  FieldConfig,
  FieldDefinition,
  FlexibleDate,
  LeafConfig,
  Measure,
  SelectOption,
  SubfieldDefinition,
  TextItem,
} from "./types";
import { CHARACTER_FACTS_SCHEMA_VERSION } from "./types";

export const LIMITS = {
  displayName: 200,
  shortText: 300,
  longText: 20_000,
  listItems: 200,
  objectListItems: 200,
  selectOptions: 100,
  subfields: 30,
  customGroups: 30,
  customFields: 200,
} as const;

const MESSAGES = {
  blank:
    "Không được để trống. Bỏ trống nghĩa là chưa xác định — hãy xóa trường thay vì lưu chuỗi rỗng.",
  duplicateId: "ID phần tử bị trùng trong cùng danh sách.",
  duplicateCode: "Mã bị trùng.",
  duplicateCharacter: "Nhân vật này đã có trong danh sách.",
  emptyItem: "Phần tử phải có ít nhất một dữ kiện.",
  unknownField: "Trường không tồn tại trong định nghĩa.",
  unknownOption: "Giá trị không nằm trong danh sách lựa chọn.",
  otherNotAllowed: "Trường này không cho phép nhập giá trị khác.",
  unknownUnit: "Đơn vị không hợp lệ cho trường này.",
  invalidDate: "Ngày không hợp lệ.",
  dayWithoutMonth: "Cần có tháng khi nhập ngày.",
  emptyDate: "Cần ít nhất năm hoặc tháng.",
  unknownGroup: "Nhóm không tồn tại.",
  nestedGroup: "Chỉ cho phép một cấp nhóm con.",
  missingLabel: "Trường tùy chỉnh cần nhãn hiển thị.",
  reservedKey: "Khóa `id` được dành riêng.",
  minAboveMax: "Giá trị nhỏ nhất phải không lớn hơn giá trị lớn nhất.",
} as const;

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Built-in `group.name` or custom `custom.<id>`; lowercase ASCII, never a display label. */
export const fieldKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*\.[a-z0-9][a-z0-9_]*$/, "Khóa trường không hợp lệ.");

export const customFieldKeySchema = z
  .string()
  .regex(/^custom\.[a-z0-9][a-z0-9_]{3,63}$/, "Khóa trường tùy chỉnh phải có dạng custom.<id>.");

export const customGroupIdSchema = z
  .string()
  .regex(/^cg_[a-z0-9][a-z0-9_]{3,63}$/, "ID nhóm tùy chỉnh phải có dạng cg_<id>.");

export const subfieldKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, "Khóa không hợp lệ.");

export const codeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, "Mã không hợp lệ.");

/** Id of a repeated element. URL/JSON-path safe; UUIDs and short random ids both fit. */
export const itemIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "ID phần tử không hợp lệ.");

export const characterIdSchema = z.uuid();

// ---------------------------------------------------------------------------
// Primitive values
// ---------------------------------------------------------------------------

function textSchema(max: number) {
  return z
    .string()
    .max(max)
    .refine((value) => /\S/u.test(value), MESSAGES.blank);
}

export const shortTextSchema = textSchema(LIMITS.shortText);
export const longTextSchema = textSchema(LIMITS.longText);

export const measureSchema = z.strictObject({
  value: z.number(),
  unit: codeSchema,
  approximate: z.boolean().optional(),
}) satisfies z.ZodType<Measure>;

function daysInMonth(month: number, year: number | undefined): number {
  if (month === 2) {
    // Unknown year: allow 29 Feb rather than guessing.
    if (year === undefined) return 29;
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export const flexibleDateSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      type: z.literal("calendar"),
      year: z.int().optional(),
      month: z.int().min(1).max(12).optional(),
      day: z.int().min(1).max(31).optional(),
      approximate: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.year === undefined && value.month === undefined) {
        ctx.addIssue({ code: "custom", message: MESSAGES.emptyDate });
      }
      if (value.day !== undefined) {
        if (value.month === undefined) {
          ctx.addIssue({ code: "custom", message: MESSAGES.dayWithoutMonth, path: ["day"] });
        } else if (value.day > daysInMonth(value.month, value.year)) {
          ctx.addIssue({ code: "custom", message: MESSAGES.invalidDate, path: ["day"] });
        }
      }
    }),
  z.strictObject({ type: z.literal("text"), text: shortTextSchema }),
]) satisfies z.ZodType<FlexibleDate>;

export const characterRefSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("character"), characterId: characterIdSchema }),
  z.strictObject({
    type: z.literal("unlinked"),
    name: shortTextSchema,
    note: longTextSchema.optional(),
  }),
]) satisfies z.ZodType<CharacterRef>;

export const textItemSchema = z.strictObject({
  id: itemIdSchema,
  text: shortTextSchema,
}) satisfies z.ZodType<TextItem>;

export const characterRefItemSchema = z.strictObject({
  id: itemIdSchema,
  ref: characterRefSchema,
});

// ---------------------------------------------------------------------------
// Value schemas derived from a definition
// ---------------------------------------------------------------------------

function findDuplicateIndex<T>(items: readonly T[], keyOf: (item: T) => string): number {
  const seen = new Set<string>();
  return items.findIndex((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

/** Array of elements with stable ids: 1..max items, ids unique within the list. */
function itemListSchema<T extends object>(item: z.ZodType<T>, max: number) {
  return z
    .array(item)
    .min(1, MESSAGES.blank)
    .max(max)
    .superRefine((items, ctx) => {
      // Every item schema passed here has a required `id` (itemIdSchema).
      const index = findDuplicateIndex(items, (entry) => (entry as { id: string }).id);
      if (index >= 0) {
        ctx.addIssue({ code: "custom", message: MESSAGES.duplicateId, path: [index, "id"] });
      }
    });
}

function choiceSchema(config: {
  readonly options: readonly SelectOption[];
  readonly allowOther?: boolean;
}) {
  const codes = new Set(optionCodes(config));
  const option = z.strictObject({
    option: z.string().refine((code) => codes.has(code), MESSAGES.unknownOption),
  });
  const schema = z.union([option, z.strictObject({ other: shortTextSchema })]);
  return (
    config.allowOther
      ? schema
      : schema.refine((choice) => !("other" in choice), MESSAGES.otherNotAllowed)
  ) satisfies z.ZodType<Choice>;
}

function choiceKey(choice: Choice): string {
  return "option" in choice ? `option:${choice.option}` : `other:${choice.other}`;
}

function rangeCheck(min: number | undefined, max: number | undefined) {
  return (value: number, ctx: z.RefinementCtx, path: PropertyKey[] = []) => {
    if (min !== undefined && value < min) {
      ctx.addIssue({ code: "custom", message: `Giá trị phải lớn hơn hoặc bằng ${min}.`, path });
    }
    if (max !== undefined && value > max) {
      ctx.addIssue({ code: "custom", message: `Giá trị phải nhỏ hơn hoặc bằng ${max}.`, path });
    }
  };
}

function leafSchema(config: LeafConfig): z.ZodType {
  switch (config.kind) {
    case "short_text":
      return shortTextSchema;
    case "long_text":
      return longTextSchema;
    case "number": {
      const check = rangeCheck(config.min, config.max);
      return (config.integer ? z.int() : z.number()).superRefine((value, ctx) => check(value, ctx));
    }
    case "measure": {
      const check = rangeCheck(config.min, config.max);
      return measureSchema.superRefine((value, ctx) => {
        if (!config.units.includes(value.unit)) {
          ctx.addIssue({ code: "custom", message: MESSAGES.unknownUnit, path: ["unit"] });
        }
        check(value.value, ctx, ["value"]);
      });
    }
    case "boolean":
      return z.boolean();
    case "date":
      return flexibleDateSchema;
    case "single_select":
      return choiceSchema(config);
    case "multi_select":
      return z
        .array(choiceSchema(config))
        .min(1, MESSAGES.blank)
        .max(LIMITS.selectOptions)
        .superRefine((choices, ctx) => {
          const index = findDuplicateIndex(choices, choiceKey);
          if (index >= 0)
            ctx.addIssue({ code: "custom", message: MESSAGES.duplicateCode, path: [index] });
        });
    case "text_list":
      return itemListSchema(textItemSchema, LIMITS.listItems);
    case "character_ref":
      return characterRefSchema;
    case "character_ref_list":
      return itemListSchema(characterRefItemSchema, LIMITS.listItems).superRefine((items, ctx) => {
        const linked = items.filter((item) => item.ref.type === "character");
        const index = findDuplicateIndex(linked, (item) =>
          item.ref.type === "character" ? item.ref.characterId : item.id,
        );
        if (index >= 0) {
          ctx.addIssue({
            code: "custom",
            message: MESSAGES.duplicateCharacter,
            path: [items.indexOf(linked[index]!), "ref"],
          });
        }
      });
  }
}

function objectSchema(fields: readonly SubfieldDefinition[], withId: boolean) {
  const shape: Record<string, z.ZodType> = {};
  for (const subfield of fields) {
    const schema = leafSchema(subfield);
    shape[subfield.key] = subfield.required ? schema : schema.optional();
  }
  if (withId) shape.id = itemIdSchema;

  return z
    .strictObject(shape)
    .refine(
      (value) => fields.some((subfield) => value[subfield.key] !== undefined),
      MESSAGES.emptyItem,
    );
}

const valueSchemaCache = new WeakMap<FieldConfig, z.ZodType>();

/** Schema for the `value` of a `specified` fact of the given field. Cached per definition. */
export function valueSchemaFor(config: FieldConfig): z.ZodType {
  const cached = valueSchemaCache.get(config);
  if (cached) return cached;

  let schema: z.ZodType;
  switch (config.kind) {
    case "object":
      schema = objectSchema(config.fields, false);
      break;
    case "object_list":
      schema = itemListSchema(
        objectSchema(config.fields, true),
        config.maxItems ?? LIMITS.objectListItems,
      );
      break;
    default:
      schema = leafSchema(config);
  }
  valueSchemaCache.set(config, schema);
  return schema;
}

// ---------------------------------------------------------------------------
// Fact envelope
// ---------------------------------------------------------------------------

/**
 * Stored fact. `unspecified` is intentionally not representable: it is the absence of the key,
 * so there is exactly one way to say "not entered yet".
 */
export const factValueSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("specified"), value: z.unknown() }),
  z.strictObject({ state: z.literal("not_applicable") }),
]);

// ---------------------------------------------------------------------------
// Custom definitions
// ---------------------------------------------------------------------------

const selectOptionSchema = z.strictObject({ code: codeSchema, label: shortTextSchema.optional() });

const selectOptionsSchema = z.array(selectOptionSchema).min(1).max(LIMITS.selectOptions);

const numberBounds = { min: z.number().optional(), max: z.number().optional() };

const leafConfigShapes = {
  short_text: {},
  long_text: {},
  number: { integer: z.boolean().optional(), ...numberBounds },
  measure: { units: z.array(codeSchema).min(1).max(20), ...numberBounds },
  boolean: {},
  date: {},
  single_select: { options: selectOptionsSchema, allowOther: z.boolean().optional() },
  multi_select: { options: selectOptionsSchema, allowOther: z.boolean().optional() },
  text_list: {},
  character_ref: {},
  character_ref_list: {},
} as const;

function leafVariants<const Extra extends z.ZodRawShape>(extra: Extra) {
  const variant = <const K extends keyof typeof leafConfigShapes>(kind: K) =>
    z.strictObject({ kind: z.literal(kind), ...leafConfigShapes[kind], ...extra });
  return [
    variant("short_text"),
    variant("long_text"),
    variant("number"),
    variant("measure"),
    variant("boolean"),
    variant("date"),
    variant("single_select"),
    variant("multi_select"),
    variant("text_list"),
    variant("character_ref"),
    variant("character_ref_list"),
  ] as const;
}

export const subfieldDefinitionSchema = z.discriminatedUnion(
  "kind",
  leafVariants({
    key: subfieldKeySchema,
    label: shortTextSchema.optional(),
    required: z.boolean().optional(),
  }),
);

const subfieldListSchema = z.array(subfieldDefinitionSchema).min(1).max(LIMITS.subfields);

const customFieldBase = {
  key: customFieldKeySchema,
  group: z.string(),
  label: shortTextSchema,
  description: longTextSchema.optional(),
};

export const customFieldDefinitionSchema = z.discriminatedUnion("kind", [
  ...leafVariants(customFieldBase),
  z.strictObject({ kind: z.literal("object"), fields: subfieldListSchema, ...customFieldBase }),
  z.strictObject({
    kind: z.literal("object_list"),
    fields: subfieldListSchema,
    maxItems: z.int().min(1).max(LIMITS.objectListItems).optional(),
    ...customFieldBase,
  }),
]);

export const customGroupDefinitionSchema = z.strictObject({
  id: customGroupIdSchema,
  label: shortTextSchema,
  parent: z.string().optional(),
}) satisfies z.ZodType<CustomGroupDefinition>;

function checkSelectConfig(
  config: { readonly options: readonly SelectOption[] },
  ctx: z.RefinementCtx,
  path: PropertyKey[],
) {
  const index = findDuplicateIndex(config.options, (option) => option.code);
  if (index >= 0) {
    ctx.addIssue({
      code: "custom",
      message: MESSAGES.duplicateCode,
      path: [...path, "options", index, "code"],
    });
  }
  config.options.forEach((option, optionIndex) => {
    if (!option.label) {
      ctx.addIssue({
        code: "custom",
        message: MESSAGES.missingLabel,
        path: [...path, "options", optionIndex, "label"],
      });
    }
  });
}

function checkLeafConfig(config: LeafConfig, ctx: z.RefinementCtx, path: PropertyKey[]) {
  if (config.kind === "single_select" || config.kind === "multi_select") {
    checkSelectConfig(config, ctx, path);
  }
  if (
    (config.kind === "number" || config.kind === "measure") &&
    config.min !== undefined &&
    config.max !== undefined &&
    config.min > config.max
  ) {
    ctx.addIssue({ code: "custom", message: MESSAGES.minAboveMax, path: [...path, "min"] });
  }
}

export const customDefinitionsSchema = z
  .strictObject({
    groups: z.array(customGroupDefinitionSchema).max(LIMITS.customGroups),
    fields: z.array(customFieldDefinitionSchema).max(LIMITS.customFields),
  })
  .superRefine((custom, ctx) => {
    const customGroups = new Map(custom.groups.map((group) => [group.id, group]));
    const groupExists = (id: string) => customGroups.has(id) || getBuiltinGroup(id) !== undefined;
    const isTopLevel = (id: string) => {
      const group = customGroups.get(id) ?? getBuiltinGroup(id);
      return group !== undefined && group.parent === undefined;
    };

    const groupDup = findDuplicateIndex(custom.groups, (group) => group.id);
    if (groupDup >= 0) {
      ctx.addIssue({
        code: "custom",
        message: MESSAGES.duplicateId,
        path: ["groups", groupDup, "id"],
      });
    }
    custom.groups.forEach((group, index) => {
      if (group.parent === undefined) return;
      if (!groupExists(group.parent)) {
        ctx.addIssue({
          code: "custom",
          message: MESSAGES.unknownGroup,
          path: ["groups", index, "parent"],
        });
      } else if (!isTopLevel(group.parent)) {
        ctx.addIssue({
          code: "custom",
          message: MESSAGES.nestedGroup,
          path: ["groups", index, "parent"],
        });
      }
    });

    const fieldDup = findDuplicateIndex(custom.fields, (definition) => definition.key);
    if (fieldDup >= 0) {
      ctx.addIssue({
        code: "custom",
        message: MESSAGES.duplicateId,
        path: ["fields", fieldDup, "key"],
      });
    }
    custom.fields.forEach((definition, index) => {
      const path = ["fields", index];
      if (!groupExists(definition.group)) {
        ctx.addIssue({ code: "custom", message: MESSAGES.unknownGroup, path: [...path, "group"] });
      }
      if (definition.kind === "object" || definition.kind === "object_list") {
        const subDup = findDuplicateIndex(definition.fields, (subfield) => subfield.key);
        if (subDup >= 0) {
          ctx.addIssue({
            code: "custom",
            message: MESSAGES.duplicateCode,
            path: [...path, "fields", subDup, "key"],
          });
        }
        definition.fields.forEach((subfield, subIndex) => {
          const subPath = [...path, "fields", subIndex];
          if (subfield.key === "id") {
            ctx.addIssue({
              code: "custom",
              message: MESSAGES.reservedKey,
              path: [...subPath, "key"],
            });
          }
          if (!subfield.label) {
            ctx.addIssue({
              code: "custom",
              message: MESSAGES.missingLabel,
              path: [...subPath, "label"],
            });
          }
          checkLeafConfig(subfield, ctx, subPath);
        });
      } else {
        checkLeafConfig(definition, ctx, path);
      }
    });
  });

// ---------------------------------------------------------------------------
// Character facts
// ---------------------------------------------------------------------------

/** Resolve a field definition: built-in first, then the sheet's custom fields. */
export function findFieldDefinition(
  key: string,
  custom: CustomDefinitions | undefined,
): FieldDefinition | undefined {
  return getBuiltinField(key) ?? custom?.fields.find((definition) => definition.key === key);
}

export const characterFactsSchema = z
  .strictObject({
    schemaVersion: z.literal(CHARACTER_FACTS_SCHEMA_VERSION),
    displayName: textSchema(LIMITS.displayName),
    values: z.record(fieldKeySchema, factValueSchema),
    custom: customDefinitionsSchema.optional(),
  })
  .superRefine((facts, ctx) => {
    for (const [key, fact] of Object.entries(facts.values)) {
      const definition = findFieldDefinition(key, facts.custom);
      if (!definition) {
        ctx.addIssue({ code: "custom", message: MESSAGES.unknownField, path: ["values", key] });
        continue;
      }
      if (fact.state !== "specified") continue;

      const result = valueSchemaFor(definition).safeParse(fact.value);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: ["values", key, "value", ...issue.path],
          });
        }
      }
    }
  });

/** Validate a fact sheet. Returns the same data (never transformed) or the validation issues. */
export function parseCharacterFacts(input: unknown) {
  return characterFactsSchema.safeParse(input) as z.ZodSafeParseResult<CharacterFacts>;
}

// --- compile-time agreement between schemas and hand-written types --------------------------

type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;

export type SchemaTypeChecks = [
  Assert<Extends<z.output<typeof customFieldDefinitionSchema>, CustomFieldDefinition>>,
  Assert<Extends<z.output<typeof subfieldDefinitionSchema>, SubfieldDefinition>>,
  Assert<Extends<z.output<typeof customDefinitionsSchema>, CustomDefinitions>>,
  Assert<Extends<z.output<typeof characterRefItemSchema>, { id: string; ref: CharacterRef }>>,
  Assert<Extends<Exclude<z.output<typeof factValueSchema>, { value: unknown }>, FactValue>>,
];
