/**
 * Generated technical ids for the editor. Ids are random — never derived from a label — and are
 * created once: renaming a field, option or item never changes its id (stable keys, Q10).
 */
import { NAMESPACES } from "@/features/characters/domain";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Lowercase alphanumeric random string; fits every id pattern of the domain. */
export function randomTail(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** Id of a repeated element (list item, event, relationship…). */
export const newItemId = (): string => randomTail(12);

export const newCustomFieldKey = (): string => `${NAMESPACES.characterField}${randomTail()}`;
export const newLibraryFieldKey = (): string => `${NAMESPACES.libraryField}${randomTail()}`;
export const newCustomGroupId = (): string => `${NAMESPACES.characterGroup}${randomTail()}`;
export const newLibraryGroupId = (): string => `${NAMESPACES.libraryGroup}${randomTail()}`;

/** Option codes and sub-field keys must start with a letter. */
export const newOptionCode = (): string => `o${randomTail(10)}`;
export const newSubfieldKey = (): string => `f${randomTail(10)}`;
