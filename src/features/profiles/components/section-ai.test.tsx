import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import { createWorkspaceState } from "../workspace/state";
import { SectionAi } from "./section-ai";
import { generateSectionAiAction, previewSectionAiAction } from "../ai/actions";

vi.mock("../ai/actions", () => ({
  previewSectionAiAction: vi.fn(),
  generateSectionAiAction: vi.fn(),
  applySectionAiAction: vi.fn(),
  discardSectionAiAction: vi.fn(async () => ({ ok: true })),
}));
const draft = createWorkspaceState({
  id: "p",
  characterId: "c",
  revision: 1,
  sections: [
    {
      id: "s",
      key: "intro",
      title: null,
      isHidden: false,
      sourceGroups: ["identity"],
      draft: null,
      draftRevision: 1,
      draftUpdatedAt: null,
      approved: null,
    },
  ],
}).drafts.s!;

describe("section AI configuration", () => {
  it.each(["geminiKeyRejected", "geminiRequestRejected"] as const)(
    "shows the specific %s failure and diagnostics without applying content",
    async (code) => {
      vi.mocked(previewSectionAiAction).mockResolvedValueOnce({
        ok: true,
        data: {
          token: "00000000-0000-4000-8000-000000000001",
          json: '{"values":{}}',
          permissions: [],
          empty: false,
          draftRevision: 1,
          configured: true,
          configurationIssues: [],
          provider: "gemini",
        },
      });
      const message = `${messages.profileAi.errors[code]}\nGoogle: HTTP 400; INVALID_ARGUMENT; diagnostic`;
      vi.mocked(generateSectionAiAction).mockResolvedValueOnce({
        ok: false,
        error: { code: "invalid_input", message },
      });
      const onApplied = vi.fn();
      render(<SectionAi sectionId="s" draft={draft} onApplied={onApplied} />);
      fireEvent.click(screen.getByRole("button", { name: messages.profileAi.open }));
      const generate = await screen.findByRole("button", { name: messages.profileAi.generate });
      await waitFor(() => expect(generate).toBeEnabled());
      fireEvent.click(generate);
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(message));
      expect(onApplied).not.toHaveBeenCalled();
      expect(screen.queryByText(messages.profileAi.candidate)).not.toBeInTheDocument();
    },
  );
  it("explains missing configuration and disables generation without altering the manual draft", async () => {
    vi.mocked(previewSectionAiAction).mockResolvedValueOnce({
      ok: true,
      data: {
        token: "00000000-0000-4000-8000-000000000001",
        json: '{"values":{"identity.age":{"state":"specified","value":"25"}}}',
        permissions: [],
        empty: false,
        draftRevision: 1,
        configured: false,
        configurationIssues: ["geminiKeyMissing"],
        provider: "gemini",
      },
    });
    const onApplied = vi.fn();
    render(<SectionAi sectionId="s" draft={draft} onApplied={onApplied} />);
    fireEvent.click(screen.getByRole("button", { name: messages.profileAi.open }));
    await waitFor(() =>
      expect(screen.getByText(messages.profileAi.errors.geminiKeyMissing)).toBeVisible(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: messages.profileAi.generate })).toBeDisabled(),
    );
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.getByText(messages.profileAi.geminiNotice)).toBeVisible();
  });
  it("requires the manual draft to finish saving before opening AI", () => {
    render(<SectionAi sectionId="s" draft={{ ...draft, status: "dirty" }} onApplied={vi.fn()} />);
    expect(screen.getByRole("button", { name: messages.profileAi.open })).toBeDisabled();
  });
});
