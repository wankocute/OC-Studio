/**
 * Presentation rules (Q7 basic/advanced mode, Q12 template presentation).
 *
 * Presentation never touches facts: hiding a field does not clear it or make it "unspecified",
 * and switching mode loses nothing. Fields that are hidden but hold a stored state are reported
 * as `hidden_with_data` so an editor can surface them instead of silently hiding data.
 */
import { z } from "zod";

import { NAMESPACES } from "./constants";
import { createFieldResolver, createGroupResolver } from "./custom-definitions";
import type { BuiltinFieldKey } from "./definitions";
import { fieldKeySchema } from "./schemas";
import type { CharacterFacts, DefinitionContext } from "./types";

export type PresentationMode = "basic" | "advanced";

/**
 * Built-in fields shown in basic mode (proposal, editable). Advanced mode shows every
 * non-deprecated field. Character- and library-scoped custom fields always show in basic mode:
 * the user created them on purpose.
 */
export const BASIC_FIELD_KEYS = [
  "identity.full_name",
  "identity.common_name",
  "identity.nicknames",
  "identity.age",
  "identity.birth_date",
  "identity.gender_identity",
  "identity.pronouns",
  "identity.species",
  "appearance.overview",
  "appearance.height",
  "appearance.hair_color",
  "appearance.eye_color",
  "appearance.special_features",
  "appearance.clothing_style",
  "personality.summary",
  "personality.core_traits",
  "personality.strengths",
  "personality.weaknesses",
  "personality.likes",
  "personality.dislikes",
  "psychology.motivations",
  "psychology.goals",
  "psychology.fears",
  "behavior.speech_style",
  "background.hometown",
  "background.family",
  "lifestyle.occupation",
  "lifestyle.hobbies",
  "lifestyle.skills",
  "history.events",
  "relationships.entries",
] as const satisfies readonly BuiltinFieldKey[];

const basicFieldKeys: ReadonlySet<string> = new Set(BASIC_FIELD_KEYS);

/**
 * What a profile template may change: visibility, order and grouping of fields, and which library
 * fields it shows. It cannot carry keys, kinds or values — the strict schema rejects them.
 */
export type TemplatePresentation = {
  /** Field keys hidden by this template (built-in or library). */
  hiddenFields?: string[];
  /** Preferred order; fields not listed keep their default order after the listed ones. */
  fieldOrder?: string[];
  /** Field key → group id to display it in (built-in or library group). */
  groupPlacement?: Record<string, string>;
  /** Library fields (`lib.*`) the template shows. */
  libraryFields?: string[];
};

const MESSAGES = {
  unknownField: "Trường không tồn tại.",
  characterScoped: "Mẫu hồ sơ không thể dùng trường riêng của một nhân vật.",
  unknownGroup: "Nhóm không tồn tại hoặc không dùng được trong mẫu hồ sơ.",
  notLibraryField: "Chỉ trường dùng chung (lib.*) mới được thêm vào mẫu hồ sơ.",
} as const;

const fieldKeyList = z.array(fieldKeySchema).max(500);

/** Validate a template presentation against built-in and library definitions. */
export function createTemplatePresentationSchema(context: DefinitionContext = {}) {
  const resolveField = createFieldResolver(undefined, context);
  const resolveGroup = createGroupResolver(undefined, context);

  return z
    .strictObject({
      hiddenFields: fieldKeyList.optional(),
      fieldOrder: fieldKeyList.optional(),
      groupPlacement: z.record(fieldKeySchema, z.string()).optional(),
      libraryFields: fieldKeyList.optional(),
    })
    .superRefine((template, ctx) => {
      const checkKey = (key: string, path: PropertyKey[]) => {
        if (key.startsWith(NAMESPACES.characterField)) {
          ctx.addIssue({ code: "custom", message: MESSAGES.characterScoped, path });
        } else if (!resolveField(key)) {
          ctx.addIssue({ code: "custom", message: MESSAGES.unknownField, path });
        }
      };
      template.hiddenFields?.forEach((key, index) => checkKey(key, ["hiddenFields", index]));
      template.fieldOrder?.forEach((key, index) => checkKey(key, ["fieldOrder", index]));
      template.libraryFields?.forEach((key, index) => {
        if (!key.startsWith(NAMESPACES.libraryField)) {
          ctx.addIssue({
            code: "custom",
            message: MESSAGES.notLibraryField,
            path: ["libraryFields", index],
          });
        } else {
          checkKey(key, ["libraryFields", index]);
        }
      });
      for (const [key, group] of Object.entries(template.groupPlacement ?? {})) {
        checkKey(key, ["groupPlacement", key]);
        if (!resolveGroup(group)) {
          ctx.addIssue({
            code: "custom",
            message: MESSAGES.unknownGroup,
            path: ["groupPlacement", key],
          });
        }
      }
    });
}

export type FieldVisibility = "visible" | "hidden_with_data" | "hidden";

export type PresentationContext = {
  mode: PresentationMode;
  template?: TemplatePresentation;
  /** The sheet being shown; used only to detect stored data, never modified. */
  facts?: Pick<CharacterFacts, "values" | "custom">;
  definitions?: DefinitionContext;
};

/** Whether an editor should show a field. Never affects stored data. */
export function getFieldVisibility(key: string, context: PresentationContext): FieldVisibility {
  const definition = createFieldResolver(context.facts?.custom, context.definitions)(key);
  const hasData = context.facts?.values[key] !== undefined;
  const hidden = (() => {
    if (!definition) return true;
    if ("deprecated" in definition && definition.deprecated) return true;
    if (context.template?.hiddenFields?.includes(key)) return true;
    if (key.startsWith(NAMESPACES.libraryField)) {
      // Library fields appear when the template lists them or the character already uses them.
      return !context.template?.libraryFields?.includes(key) && !hasData;
    }
    if (key.startsWith(NAMESPACES.characterField)) return false;
    return context.mode === "basic" && !basicFieldKeys.has(key);
  })();
  if (!hidden) return "visible";
  return hasData ? "hidden_with_data" : "hidden";
}

/** Display group of a field: template placement if any, else the definition's default group. */
export function getFieldGroup(key: string, context: PresentationContext): string | undefined {
  const placement = context.template?.groupPlacement?.[key];
  if (placement) return placement;
  return createFieldResolver(context.facts?.custom, context.definitions)(key)?.group;
}
