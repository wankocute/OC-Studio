import { BASIC_FACT_KEYS, type BasicFactField } from "@/features/characters/basic-info";
import { type CharacterFacts, factLabelsVi } from "@/features/characters/domain";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

const f = messages.characters.fields;

const LABELS: Record<BasicFactField, string> = {
  fullName: f.fullName,
  age: f.age,
  genderIdentity: f.genderIdentity,
  pronouns: f.pronouns,
  species: f.species,
  occupation: f.occupation,
};

/** Display text for one basic fact, or `null` when unspecified. Never invents a value. */
function describe(field: BasicFactField, facts: CharacterFacts): string | null {
  const fact = facts.values[BASIC_FACT_KEYS[field]];
  if (!fact) return null;
  if (fact.state === "not_applicable") return messages.common.notApplicable;
  if (fact.state === "explicit_none") return messages.common.explicitNone;
  const value = fact.value as unknown;
  if (field === "age") {
    const age = value as { value: number; unit: "years" | "months"; approximate?: boolean };
    return messages.characters.ageValue(age.value, age.approximate === true, age.unit);
  }
  if (field === "genderIdentity") {
    const choice = value as { option?: string; other?: string };
    return (
      choice.other ??
      factLabelsVi.options["identity.gender_identity"]?.[choice.option ?? ""] ??
      choice.option ??
      null
    );
  }
  return String(value);
}

export function BasicInfoView({ facts }: { facts: CharacterFacts }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {(Object.keys(LABELS) as BasicFactField[]).map((field) => {
        const text = describe(field, facts);
        const stored = facts.values[BASIC_FACT_KEYS[field]];
        return (
          <div key={field} className="space-y-0.5">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {LABELS[field]}
            </dt>
            <dd
              className={cn(
                "text-sm break-words",
                (!stored || stored.state !== "specified") && "text-muted-foreground italic",
              )}
            >
              {text ?? messages.common.unspecified}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
