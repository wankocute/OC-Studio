"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMMON_LANGUAGE_TAGS,
  draftToLanguage,
  LANGUAGE_OTHER,
  type LanguageDraft,
  languageName,
} from "@/features/characters/editor/language";
import { messages } from "@/i18n";

import { useEditorContext } from "./editor-context";
import { FieldMessage } from "./field-message";

const t = messages.editor.general;
const UNSET = "__unset";

export function GeneralPanel({
  displayName,
  onDisplayName,
  language,
  onLanguage,
  factCount,
}: {
  displayName: string;
  onDisplayName: (value: string) => void;
  language: LanguageDraft;
  onLanguage: (draft: LanguageDraft) => void;
  factCount: number;
}) {
  const { errors, idPrefix } = useEditorContext();
  const nameError = errors.displayName
    ? displayName.trim() === ""
      ? t.displayNameRequired
      : errors.displayName
    : undefined;
  const tag = draftToLanguage(language);
  const recognized = tag ? languageName(tag) : undefined;
  const languageError = errors.sourceLanguage
    ? `${errors.sourceLanguage} ${t.languageTagExample}`
    : undefined;

  return (
    <section aria-labelledby={`${idPrefix}general-title`} className="space-y-5">
      <div className="space-y-1">
        <h2
          id={`${idPrefix}general-title`}
          className="font-heading text-2xl font-semibold tracking-tight"
        >
          {messages.editor.nav.general}
        </h2>
        <p className="text-sm text-muted-foreground">{t.description}</p>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}general-display-name`}>
            {t.displayName} <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}general-display-name`}
            value={displayName}
            onChange={(event) => onDisplayName(event.target.value)}
            aria-invalid={Boolean(nameError) || undefined}
            aria-describedby={
              nameError
                ? `${idPrefix}general-display-name-error`
                : `${idPrefix}general-display-name-hint`
            }
            className="sm:max-w-md"
          />
          {nameError ? (
            <FieldMessage id={`${idPrefix}general-display-name-error`} message={nameError} />
          ) : (
            <FieldMessage
              id={`${idPrefix}general-display-name-hint`}
              tone="hint"
              message={t.displayNameHint}
            />
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}general-language`}>{t.language}</Label>
          <FieldMessage tone="hint" message={t.languageHint} />
          <Select
            value={language.choice || UNSET}
            onValueChange={(choice) =>
              onLanguage({ ...language, choice: choice === UNSET ? "" : choice })
            }
          >
            <SelectTrigger id={`${idPrefix}general-language`} className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>{t.languageUnset}</SelectItem>
              {COMMON_LANGUAGE_TAGS.map((code) => (
                <SelectItem key={code} value={code}>
                  {languageName(code) ?? code} ({code})
                </SelectItem>
              ))}
              <SelectItem value={LANGUAGE_OTHER}>{t.languageOther}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {language.choice === LANGUAGE_OTHER && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}general-language-tag`}>{t.languageTag}</Label>
            <Input
              id={`${idPrefix}general-language-tag`}
              value={language.other}
              placeholder={t.languageTagPlaceholder}
              onChange={(event) => onLanguage({ ...language, other: event.target.value })}
              aria-invalid={Boolean(languageError) || undefined}
              aria-describedby={`${idPrefix}general-language-tag-message`}
              className="sm:max-w-xs"
            />
            {languageError ? (
              <FieldMessage
                id={`${idPrefix}general-language-tag-message`}
                message={languageError}
              />
            ) : (
              <FieldMessage
                id={`${idPrefix}general-language-tag-message`}
                tone="hint"
                message={recognized ? t.languageRecognized(recognized) : t.languageTagExample}
              />
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{t.factTotal(factCount)}</p>
    </section>
  );
}
