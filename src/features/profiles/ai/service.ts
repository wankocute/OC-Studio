import "server-only";
import { randomUUID } from "node:crypto";
import type { CharacterFacts, DefinitionContext } from "@/features/characters/domain";
import { canonicalJson } from "@/features/characters/domain";
import { AI_LIMITS } from "./constants";
import { selectSectionFacts, type AiSnapshot } from "./facts";
import { AiError, parseAiOutput, type SectionWriter } from "./provider";
import type { RichTextDocument } from "../domain";

export type AiContext = {
  sectionId: string;
  draftRevision: number;
  facts: CharacterFacts;
  context: DefinitionContext;
  groups: string[];
  title: string;
};
type Preview = {
  kind: "preview";
  expires: number;
  input: Pick<AiContext, "sectionId" | "draftRevision" | "title" | "groups">;
  allow: string[];
  json: string;
  snapshot: AiSnapshot;
};
type Candidate = {
  kind: "candidate";
  expires: number;
  input: Preview["input"];
  content: RichTextDocument;
  snapshot: AiSnapshot;
  json: string;
  allow: string[];
};

export function createAiService() {
  const entries = new Map<string, Preview | Candidate>();
  const running = new Set<string>();
  function put(value: Preview | Candidate) {
    for (const [key, entry] of entries) if (entry.expires <= Date.now()) entries.delete(key);
    if (entries.size >= AI_LIMITS.entries) throw new AiError("busy");
    const token = randomUUID();
    entries.set(token, value);
    return token;
  }
  function get(token: string) {
    const entry = entries.get(token);
    if (!entry || entry.expires <= Date.now()) {
      entries.delete(token);
      throw new AiError("expired");
    }
    return entry;
  }
  return {
    preview(input: AiContext, allow: string[]) {
      const selected = selectSectionFacts(input.facts, input.context, input.groups, allow);
      if (selected.json.length > AI_LIMITS.inputChars) throw new AiError("limit");
      const token = put({
        kind: "preview",
        expires: Date.now() + AI_LIMITS.ttlMs,
        input: {
          sectionId: input.sectionId,
          draftRevision: input.draftRevision,
          title: input.title,
          groups: [...input.groups],
        },
        allow,
        json: selected.json,
        snapshot: selected.snapshot,
      });
      return {
        token,
        json: selected.json,
        permissions: selected.permissions,
        empty: Object.keys(selected.payload.values).length === 0,
        draftRevision: input.draftRevision,
      };
    },
    async generate(
      token: string,
      instruction: string,
      writer: SectionWriter,
      load: (sectionId: string) => Promise<AiContext>,
    ) {
      const entry = get(token);
      if (entry.kind !== "preview") throw new AiError("expired");
      if (running.has(entry.input.sectionId)) throw new AiError("busy");
      entries.delete(token); // Consent is consumed even when the provider fails.
      running.add(entry.input.sectionId);
      try {
        const current = await load(entry.input.sectionId);
        const selected = selectSectionFacts(
          current.facts,
          current.context,
          current.groups,
          entry.allow,
        );
        if (
          selected.json !== entry.json ||
          current.title !== entry.input.title ||
          canonicalJson(current.groups) !== canonicalJson(entry.input.groups)
        )
          throw new AiError("changed");
        if (Object.keys(selected.payload.values).length === 0) throw new AiError("empty");
        if (instruction.length > AI_LIMITS.instructionChars) throw new AiError("limit");
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const output = await Promise.race([
          writer.generate(
            entry.json,
            JSON.stringify({ sectionTitle: current.title, request: instruction }),
            controller.signal,
          ),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              controller.abort();
              reject(new AiError("network"));
            }, AI_LIMITS.timeoutMs);
          }),
        ]).finally(() => clearTimeout(timeout));
        const content = parseAiOutput(output);
        const latest = await load(entry.input.sectionId);
        const stale =
          selectSectionFacts(latest.facts, latest.context, latest.groups, entry.allow).json !==
            entry.json || latest.title !== entry.input.title;
        const candidate = put({
          kind: "candidate",
          expires: Date.now() + AI_LIMITS.ttlMs,
          input: entry.input,
          content,
          snapshot: entry.snapshot,
          json: entry.json,
          allow: entry.allow,
        });
        return { token: candidate, content, stale, draftRevision: entry.input.draftRevision };
      } finally {
        running.delete(entry.input.sectionId);
      }
    },
    async apply(
      token: string,
      confirmStale: boolean,
      load: (sectionId: string) => Promise<AiContext>,
      write: (candidate: {
        sectionId: string;
        draftRevision: number;
        content: RichTextDocument;
        snapshot: AiSnapshot;
      }) => Promise<{ draftRevision: number; savedAt: string }>,
    ) {
      const entry = get(token);
      if (entry.kind !== "candidate") throw new AiError("expired");
      const latest = await load(entry.input.sectionId);
      const stale =
        selectSectionFacts(latest.facts, latest.context, latest.groups, entry.allow).json !==
          entry.json || latest.title !== entry.input.title;
      if (stale && !confirmStale) throw new AiError("stale");
      const saved = await write({
        sectionId: entry.input.sectionId,
        draftRevision: entry.input.draftRevision,
        content: entry.content,
        snapshot: entry.snapshot,
      });
      entries.delete(token);
      return { ...saved, content: entry.content, stale };
    },
    discard(token: string) {
      entries.delete(token);
    },
  };
}

// Survives HMR; bounded and ephemeral, deliberately not a generation archive.
const globalAi = globalThis as typeof globalThis & {
  ocSectionAi?: ReturnType<typeof createAiService>;
};
export const sectionAi = (globalAi.ocSectionAi ??= createAiService());
