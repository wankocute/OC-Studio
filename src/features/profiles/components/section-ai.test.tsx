import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import { createWorkspaceState } from "../workspace/state";
import { SectionAi } from "./section-ai";
import { previewSectionAiAction } from "../ai/actions";

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
        provider: "gemini",
      },
    });
    const onApplied = vi.fn();
    render(<SectionAi sectionId="s" draft={draft} onApplied={onApplied} />);
    fireEvent.click(screen.getByRole("button", { name: messages.profileAi.open }));
    await waitFor(() => expect(screen.getByText(messages.profileAi.missing)).toBeVisible());
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
