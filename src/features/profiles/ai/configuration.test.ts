import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/lib/env";

import { aiConfiguration, createConfiguredWriter, resolveModel } from "./configuration";
import { createGeminiWriter } from "./gemini";
import { parseGeminiAllowlist } from "./gemini-models";

const env = (values: Record<string, string>) =>
  parseServerEnv({ GEMINI_API_KEY: "test-secret", ...values });

const okResponse = () =>
  Response.json({
    candidates: [
      { finishReason: "STOP", content: { parts: [{ text: '{"paragraphs":["An."]}' }] } },
    ],
  });

describe("Gemini model allowlist", () => {
  it("defaults to the models verified in code when GEMINI_ALLOWED_MODELS is not set", () => {
    const configuration = aiConfiguration(env({ GEMINI_MODEL: "gemini-3.8-flash" }));
    expect(configuration.configured).toBe(true);
    expect(configuration.defaultModel).toBe("gemini-3.8-flash");
    expect(configuration.models.map((model) => model.id)).toContain("gemini-3.5-flash-lite");
    expect(configuration.models.find((model) => model.id === "gemini-3.5-flash-lite")).toEqual({
      id: "gemini-3.5-flash-lite",
      label: "Gemini 3.5 Flash-Lite",
      hint: "Ưu tiên tốc độ",
    });
    // A model nobody listed is refused, as before this setting existed.
    expect(
      aiConfiguration(env({ GEMINI_MODEL: "gemini-3.1-pro-preview" })).configurationIssues,
    ).toEqual(["geminiModelUnsupported"]);
  });

  it("uses the configured list, which must contain the default model", () => {
    const allowed = "gemini-3.5-flash-lite, gemini-3.8-flash ,gemini-3.8-flash";
    expect(parseGeminiAllowlist(allowed)).toEqual({
      models: ["gemini-3.5-flash-lite", "gemini-3.8-flash"],
      invalid: [],
    });
    const configuration = aiConfiguration(
      env({ GEMINI_ALLOWED_MODELS: allowed, GEMINI_MODEL: "gemini-3.8-flash" }),
    );
    expect(configuration.models.map((model) => model.id)).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
    ]);
    expect(
      aiConfiguration(
        env({ GEMINI_ALLOWED_MODELS: "gemini-3.5-flash-lite", GEMINI_MODEL: "gemini-3.8-flash" }),
      ).configurationIssues,
    ).toEqual(["geminiModelUnsupported"]);
    expect(
      aiConfiguration(
        env({
          GEMINI_ALLOWED_MODELS: "gemini-3.8-flash,../evil",
          GEMINI_MODEL: "gemini-3.8-flash",
        }),
      ).configurationIssues,
    ).toEqual(["geminiAllowlistInvalid"]);
  });

  it("resolves the requested model only from the allowlist, never trusting the client", () => {
    const configured = env({
      GEMINI_ALLOWED_MODELS: "gemini-3.8-flash,gemini-3.5-flash-lite",
      GEMINI_MODEL: "gemini-3.8-flash",
    });
    expect(resolveModel(configured)).toBe("gemini-3.8-flash");
    expect(resolveModel(configured, "gemini-3.5-flash-lite")).toBe("gemini-3.5-flash-lite");
    for (const requested of ["gemini-3.1-pro-preview", "gpt-4o", "gemini-3.8-flash?key=x", ""]) {
      expect(() => resolveModel(configured, requested)).toThrow("modelNotAllowed");
    }
    expect(() =>
      resolveModel(env({ GEMINI_MODEL: "gemini-3.8-flash", GEMINI_API_KEY: "" })),
    ).toThrow("geminiKeyMissing");
  });

  it("refuses a model outside the allowlist before any request", async () => {
    const request = vi.fn<typeof fetch>();
    const writer = createConfiguredWriter(
      env({ GEMINI_ALLOWED_MODELS: "gemini-3.8-flash", GEMINI_MODEL: "gemini-3.8-flash" }),
      request,
      "gemini-3.1-pro-preview",
    );
    await expect(writer.generate("{}", "", new AbortController().signal)).rejects.toThrow(
      "geminiModelUnsupported",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("calls the chosen model and sends thinking settings only where documented", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => okResponse());
    await createGeminiWriter("test-secret", "gemini-3.8-flash", request).generate(
      "{}",
      "",
      new AbortController().signal,
    );
    await createGeminiWriter("test-secret", "gemini-3.5-flash-lite", request).generate(
      "{}",
      "",
      new AbortController().signal,
    );
    const [flash, lite] = request.mock.calls;
    expect(String(flash![0])).toContain("/models/gemini-3.8-flash:generateContent");
    expect(String(lite![0])).toContain("/models/gemini-3.5-flash-lite:generateContent");
    const config = (call: Parameters<typeof fetch>) =>
      JSON.parse(String(call[1]!.body)).generationConfig;
    expect(config(flash!).thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(config(lite!).thinkingConfig).toBeUndefined();
  });
});
