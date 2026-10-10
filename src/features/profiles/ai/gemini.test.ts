import { describe, expect, it, vi } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { createGeminiWriter, GEMINI_FREE_MODEL } from "./gemini";
import { aiConfiguration, createConfiguredWriter } from "./configuration";
import { AiError, parseAiOutput } from "./provider";
import { AI_LIMITS } from "./constants";

const signal = () => new AbortController().signal;
const response = (text: string, finishReason = "STOP") =>
  Response.json({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
const rawEnv = {
  GEMINI_API_KEY: "test-secret",
  GEMINI_MODEL: GEMINI_FREE_MODEL,
  OPENAI_API_KEY: "other-secret",
  OPENAI_MODEL: "other-model",
};
const configured = () => parseServerEnv(rawEnv);

describe("Gemini adapter and provider selection", () => {
  it("identifies each missing or unsupported configuration variable without exposing credentials", () => {
    for (const [source, issues] of [
      [{}, ["geminiKeyMissing", "geminiModelMissing"]],
      [{ GEMINI_API_KEY: "private-key" }, ["geminiModelMissing"]],
      [{ GEMINI_MODEL: GEMINI_FREE_MODEL }, ["geminiKeyMissing"]],
      [{ GEMINI_API_KEY: "private-key", GEMINI_MODEL: "other" }, ["geminiModelUnsupported"]],
      [{ AI_PROVIDER: "openai" }, ["openaiKeyMissing", "openaiModelMissing"]],
    ] as const) {
      const status = aiConfiguration(parseServerEnv(source));
      expect(status.configurationIssues).toEqual(issues);
      expect(status.configured).toBe(false);
      expect(JSON.stringify(status)).not.toContain("private-key");
    }
    expect(
      aiConfiguration(
        parseServerEnv({
          AI_PROVIDER: " gemini ",
          GEMINI_API_KEY: " private-key ",
          GEMINI_MODEL: ` ${GEMINI_FREE_MODEL} `,
        }),
      ).configured,
    ).toBe(true);
  });
  it("recognizes Google's API_KEY_INVALID reason without leaking provider details or retrying", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            message: "private-key and private facts",
            details: [{ reason: "API_KEY_INVALID" }],
          },
        },
        { status: 400 },
      ),
    );
    await expect(
      createConfiguredWriter(configured(), request).generate("{}", "", signal()),
    ).rejects.toThrow(/^geminiKeyRejected$/);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("defaults to Gemini despite OpenAI credentials; matches preview facts and keeps key out of URL/body", async () => {
    const env = configured();
    expect(env.AI_PROVIDER).toBe("gemini");
    expect(aiConfiguration(env)).toMatchObject({
      provider: "gemini",
      configured: true,
      configurationIssues: [],
      defaultModel: GEMINI_FREE_MODEL,
    });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response('{"paragraphs":["An sinh tại Huế."]}'));
    const facts =
      '{"displayName":"An","values":{"background.birthplace":{"state":"specified","value":"Huế"}}}';
    const output = await createConfiguredWriter(env, request).generate(facts, "request", signal());
    const [url, options] = request.mock.calls[0]!;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    expect(String(url)).not.toContain("test-secret");
    expect(options?.headers).toMatchObject({ "x-goog-api-key": "test-secret" });
    const body = JSON.parse(String(options?.body));
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({
      facts: JSON.parse(facts),
      writingRequest: "request",
    });
    expect(body.generationConfig.maxOutputTokens).toBe(AI_LIMITS.outputTokens);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(body.generationConfig.responseFormat.text.mimeType).toBe("APPLICATION_JSON");
    expect(body.tools).toBeUndefined();
    expect(String(options?.body)).not.toContain("test-secret");
    expect(parseAiOutput(output).content[0]).toMatchObject({ type: "paragraph" });
  });
  it("never falls back or retries 429/network/configuration failures", async () => {
    for (const [status, error] of [
      [429, "rateLimit"],
      [400, "geminiRejected"],
      [401, "geminiUnauthorized"],
      [403, "geminiForbidden"],
      [404, "geminiModelNotFound"],
      [500, "network"],
    ] as const) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("private error", { status }));
      await expect(
        createConfiguredWriter(configured(), request).generate("{}", "", signal()),
      ).rejects.toThrow(error);
      expect(request).toHaveBeenCalledTimes(1);
      expect(String(request.mock.calls[0]![0])).toContain("generativelanguage.googleapis.com");
    }
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret provider details"));
    await expect(
      createConfiguredWriter(configured(), request).generate("{}", "", signal()),
    ).rejects.toThrow("network");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("refuses missing Gemini configuration and unapproved models even if OpenAI is configured", async () => {
    const request = vi.fn<typeof fetch>();
    for (const env of [
      parseServerEnv({ OPENAI_API_KEY: "secret", OPENAI_MODEL: "model" }),
      parseServerEnv({ GEMINI_API_KEY: "key", GEMINI_MODEL: "gemini-paid-or-unverified-model" }),
    ]) {
      expect(aiConfiguration(env).configured).toBe(false);
      await expect(
        createConfiguredWriter(env, request).generate("{}", "", signal()),
      ).rejects.toThrow(/^gemini(KeyMissing|ModelUnsupported)$/);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("only calls OpenAI when explicitly selected", async () => {
    const env = parseServerEnv({ ...rawEnv, AI_PROVIDER: "openai" });
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: '{"paragraphs":["An."]}' }] },
        ],
      }),
    );
    await createConfiguredWriter(env, request).generate("{}", "", signal());
    expect(request.mock.calls[0]![0]).toBe("https://api.openai.com/v1/responses");
  });
  it("tells blocked, truncated, empty and malformed responses apart, without retrying", async () => {
    const cases: [Response, string, string?][] = [
      // The prompt itself was blocked: no candidates are returned.
      [Response.json({ promptFeedback: { blockReason: "SAFETY" } }), "blocked", "SAFETY"],
      [Response.json({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }), "blocked"],
      [response('{"paragraphs":["x"]}', "PROHIBITED_CONTENT"), "blocked", "PROHIBITED_CONTENT"],
      [response('{"paragraphs":["x"]}', "SPII"), "blocked"],
      [response('{"paragraphs":["x"]}', "RECITATION"), "blocked"],
      [response('{"paragraphs":["partial"]}', "MAX_TOKENS"), "outputTruncated"],
      [Response.json({ candidates: [] }), "outputEmpty"],
      [response(""), "outputEmpty"],
      [response('{"paragraphs":["x"]}', "MALFORMED_RESPONSE"), "output", "MALFORMED_RESPONSE"],
      [response("not JSON"), "output"],
      [new Response("invalid outer JSON"), "output"],
      [response('{"paragraphs":[]}'), "output"],
      [response(JSON.stringify({ paragraphs: ["a".repeat(AI_LIMITS.outputChars + 1)] })), "output"],
      [new Response("a".repeat(AI_LIMITS.responseBytes + 1)), "output"],
    ];
    for (const [result, code, status] of cases) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(result);
      const error = await (async () =>
        parseAiOutput(
          await createGeminiWriter("key", GEMINI_FREE_MODEL, request).generate("{}", "", signal()),
        ))().catch((caught: unknown) => caught);
      expect(error, code).toBeInstanceOf(AiError);
      expect((error as AiError).code).toBe(code);
      if (status) expect((error as AiError).diagnostic?.status).toBe(status);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
  it("passes through cancellation and excludes thought parts from the proposed text", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { thought: true, text: "private thought" },
                { text: '{"paragraphs":["An."]}' },
              ],
            },
          },
        ],
      }),
    );
    const controller = new AbortController();
    const output = await createGeminiWriter("key", GEMINI_FREE_MODEL, request).generate(
      "{}",
      "",
      controller.signal,
    );
    expect(request.mock.calls[0]![1]?.signal).toBe(controller.signal);
    expect(output).toEqual({ paragraphs: ["An."] });
  });
});
