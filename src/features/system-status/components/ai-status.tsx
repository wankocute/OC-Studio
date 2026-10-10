import { connection } from "next/server";

import { aiConfiguration } from "@/features/profiles/ai/configuration";
import { messages } from "@/i18n";
import { getServerEnv } from "@/lib/env";

import { StatusRow } from "./status-row";

const t = messages.status.ai;

/**
 * Selected AI provider and model, and whether the local configuration is complete. Never calls
 * the provider and never shows keys: "configured" says nothing about connectivity or quota.
 */
export async function AiStatus() {
  await connection();
  const env = getServerEnv();
  const { provider, configured, configurationIssues } = aiConfiguration(env);
  const model = (provider === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL) || t.noModel;
  const summary = `${t.providers[provider]} · ${model}`;
  const issue = configurationIssues[0];
  return configured ? (
    <StatusRow
      label={t.label}
      tone="success"
      value={t.configured}
      detail={`${summary}. ${t.configuredHint}`}
    />
  ) : (
    <StatusRow
      label={t.label}
      tone="warning"
      value={t.notConfigured}
      detail={`${summary}. ${issue ? messages.profileAi.errors[issue] : ""}`}
    />
  );
}

export function AiStatusFallback() {
  return <StatusRow label={t.label} tone="pending" value={messages.status.checking} />;
}
