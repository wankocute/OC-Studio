import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeminiWriter, GEMINI_FREE_MODEL } from "./gemini";
import { logAiRequest, transportFailure } from "./transport";

afterEach(() => vi.restoreAllMocks());

describe("AI transport diagnostics", () => {
  it.each([
    ["ENOTFOUND", "dns"],
    ["EAI_AGAIN", "dns"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "tls"],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "tls"],
    ["UND_ERR_CONNECT_TIMEOUT", "fetch"],
    ["ECONNRESET", "fetch"],
  ])("classifies %s separately from an AbortController deadline", (code, kind) => {
    const error = new TypeError("private error", { cause: { code } });
    expect(transportFailure(error, false)).toEqual({
      kind,
      errorName: "TypeError",
      causeCode: code,
    });
    expect(transportFailure(error, true).kind).toBe("timeout");
  });
  it("logs only approved identifiers, elapsed time and HTTP status", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const failure = transportFailure(
      { name: "private-key", cause: { code: "private-facts" }, message: "private-url" },
      false,
    );
    expect(failure).toEqual({ kind: "fetch", errorName: "Error" });
    const startedAt = Date.now() - 100;
    logAiRequest(failure.kind, startedAt, { errorName: failure.errorName, httpStatus: 200 });
    expect(log).toHaveBeenCalledWith(
      "[profile-ai]",
      expect.objectContaining({ kind: "fetch", httpStatus: 200 }),
    );
    expect(log.mock.calls[0]![1].elapsedMs).toBeGreaterThanOrEqual(100);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });
  it.each([
    ["ENOTFOUND", "dns"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "tls"],
    ["ECONNRESET", "network"],
  ])("preserves %s in a safe log and does not retry", async (code, expected) => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError("private-key private-facts https://example.com/?key=private-key", {
        cause: { code },
      }),
    );
    await expect(
      createGeminiWriter("private-key", GEMINI_FREE_MODEL, request).generate(
        '{"name":"private-facts"}',
        "private-instruction",
        new AbortController().signal,
      ),
    ).rejects.toThrow(expected);
    expect(request).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[profile-ai]",
      expect.objectContaining({ causeCode: code, errorName: "TypeError" }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    expect(JSON.stringify(log.mock.calls)).not.toContain("https://");
  });
  it("distinguishes a controller abort from a fetch failure", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      controller.abort(new DOMException("deadline", "TimeoutError"));
      throw options?.signal?.reason;
    });
    await expect(
      createGeminiWriter("key", GEMINI_FREE_MODEL, request).generate("{}", "", controller.signal),
    ).rejects.toThrow("timeout");
    expect(request).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[profile-ai]",
      expect.objectContaining({ kind: "timeout", errorName: "TimeoutError" }),
    );
  });
  it("records an HTTP failure distinctly from DNS, TLS and aborts", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { status: "INVALID_ARGUMENT", message: "Invalid parameter" } },
          { status: 400 },
        ),
      );
    await expect(
      createGeminiWriter("key", GEMINI_FREE_MODEL, request).generate(
        "{}",
        "",
        new AbortController().signal,
      ),
    ).rejects.toThrow("geminiRequestRejected");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[profile-ai]",
      expect.objectContaining({ kind: "http", httpStatus: 400 }),
    );
  });
});
