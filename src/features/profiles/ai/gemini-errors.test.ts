import { describe, expect, it, vi } from "vitest";
import { geminiResponseError } from "./gemini-errors";
import { createGeminiWriter, GEMINI_FREE_MODEL } from "./gemini";

// Actual Google REST error from the diagnostic request on 2026-10-10; no OC facts sent.
const mimeError = {
  error: {
    code: 400,
    message:
      "Invalid value at 'generation_config.response_format.text.mime_type' (type.googleapis.com/google.ai.generativelanguage.v1beta.TextResponseFormat.MimeType), \"application/json\"",
    status: "INVALID_ARGUMENT",
  },
};

describe("Gemini error diagnostics", () => {
  it("retains the actual rejected MIME enum diagnostic and sends the corrected REST value", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(mimeError, { status: 400 }));
    const writer = createGeminiWriter("test-key", GEMINI_FREE_MODEL, request);
    const error = await writer
      .generate("{}", "", new AbortController().signal)
      .catch((error: unknown) => error);
    expect(error).toMatchObject({
      code: "geminiRequestRejected",
      diagnostic: {
        httpStatus: 400,
        status: "INVALID_ARGUMENT",
        message: mimeError.error.message,
        reasons: [],
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(request.mock.calls[0]![1]?.body));
    expect(body.generationConfig.responseFormat.text.mimeType).toBe("APPLICATION_JSON");
  });
  it("distinguishes API key errors, preconditions and unspecified 400 responses", async () => {
    for (const [body, code] of [
      [
        {
          status: "INVALID_ARGUMENT",
          message: "API key not valid. Please pass a valid API key.",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "API_KEY_INVALID",
              metadata: { consumer: "private-project" },
            },
          ],
        },
        "geminiKeyRejected",
      ],
      [
        { status: "FAILED_PRECONDITION", message: "Free tier is not available in your country." },
        "geminiPrecondition",
      ],
      [{ message: "Request rejected by the service." }, "geminiRejected"],
    ] as const) {
      const error = await geminiResponseError(
        Response.json({ error: body }, { status: 400 }),
        "key",
        "{}",
        "",
      );
      expect(error.code).toBe(code);
      expect(error.diagnostic?.httpStatus).toBe(400);
      expect(JSON.stringify(error)).not.toContain("private-project");
    }
  });
  it("redacts keys, keyed URLs, facts and user instructions before retaining diagnostics; never logs", async () => {
    const log = vi.spyOn(console, "log");
    const warn = vi.spyOn(console, "warn");
    const errorLog = vi.spyOn(console, "error");
    const key = "test-private-key";
    const facts = {
      displayName: "PRIVATE_OC",
      values: { "identity.note": { state: "specified", value: "PRIVATE_FACT" } },
    };
    const json = JSON.stringify(facts);
    const instruction = JSON.stringify({
      request: "PRIVATE_REQUEST",
      sectionTitle: "PRIVATE_TITLE",
    });
    const error = await geminiResponseError(
      Response.json(
        {
          error: {
            status: "INVALID_ARGUMENT",
            message: `Rejected ${key}; https://example.com/?key=${key}; ${json}; ${JSON.stringify(json)}; PRIVATE_REQUEST; PRIVATE_TITLE`,
            details: [{ reason: `BAD_${key}` }, { fieldViolations: [{ description: json }] }],
          },
        },
        { status: 400 },
      ),
      key,
      json,
      instruction,
    );
    const retained = JSON.stringify(error);
    for (const secret of [
      key,
      "PRIVATE_OC",
      "PRIVATE_FACT",
      "PRIVATE_REQUEST",
      "PRIVATE_TITLE",
      "https://example.com",
    ])
      expect(retained).not.toContain(secret);
    expect(error.diagnostic?.message).toContain("[đã che]");
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it("handles non-JSON or empty response bodies without inventing a payload cause", async () => {
    for (const body of ["", "non-JSON provider response"]) {
      const error = await geminiResponseError(new Response(body, { status: 400 }), "key", "{}", "");
      expect(error).toMatchObject({
        code: "geminiRejected",
        diagnostic: { httpStatus: 400, reasons: [] },
      });
      expect(error.diagnostic?.message).toBeUndefined();
    }
  });
});
