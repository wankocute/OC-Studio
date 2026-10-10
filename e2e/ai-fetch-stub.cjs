// Preloaded only by Playwright's isolated server; never loaded by the application itself.
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_e2e_test")) {
  throw new Error("AI fetch stub requires the isolated E2E database");
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (url, options) {
  const host = new URL(String(url)).hostname;
  const gemini = host === "generativelanguage.googleapis.com";
  if (!gemini && host !== "api.openai.com") return originalFetch(url, options);
  const request = JSON.parse(options.body);
  const input = JSON.parse(gemini ? request.contents[0].parts[0].text : request.input);
  const writing = JSON.parse(input.writingRequest);
  if (writing.request === "E2E_RATE_LIMIT") return new Response("rate limited", { status: 429 });
  if (
    JSON.stringify(input.facts).includes("E2E_PRIVATE") &&
    !writing.request.includes("ALLOW_PRIVATE")
  )
    throw new Error("Sensitive data leaked to provider");
  const text = JSON.stringify({
    paragraphs:
      writing.request === "E2E_INVALID"
        ? []
        : [`${input.facts.displayName}: đề xuất AI cho ${writing.sectionTitle}.`],
  });
  if (gemini)
    return Response.json({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
    });
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text,
          },
        ],
      },
    ],
  });
};
