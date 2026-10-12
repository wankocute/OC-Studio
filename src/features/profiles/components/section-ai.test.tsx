import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n";
import type { AiJobView } from "../ai/service";
import { createWorkspaceState, type SectionDraftState } from "../workspace/state";
import { markForTyping } from "./rich-text-typing";
import { SectionAi } from "./section-ai";
import { AI_POLL_INTERVAL_MS, useAiJobs } from "./use-ai-jobs";
import {
  applySectionAiAction,
  getSectionAiJobsAction,
  previewSectionAiAction,
  startSectionAiAction,
} from "../ai/actions";

vi.mock("../ai/actions", () => ({
  previewSectionAiAction: vi.fn(),
  startSectionAiAction: vi.fn(),
  getSectionAiJobsAction: vi.fn(),
  cancelSectionAiJobAction: vi.fn(),
  dismissSectionAiJobAction: vi.fn(async () => ({ ok: true })),
  applySectionAiAction: vi.fn(),
  discardSectionAiAction: vi.fn(async () => ({ ok: true })),
}));

const t = messages.profileAi;
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

const preview = (overrides: Partial<{ configured: boolean; issues: string[] }> = {}) => ({
  ok: true as const,
  data: {
    token: "00000000-0000-4000-8000-000000000001" as const,
    json: '{"values":{"identity.age":{"state":"specified","value":"25"}}}',
    empty: false,
    draftRevision: 1,
    configured: overrides.configured ?? true,
    configurationIssues: (overrides.issues ?? []) as never[],
    provider: "gemini" as const,
    models: [
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", hint: "Ưu tiên tốc độ" },
    ],
    defaultModel: "gemini-3.8-flash",
  },
});

const job = (overrides: Partial<AiJobView> = {}): AiJobView => ({
  id: "00000000-0000-4000-8000-0000000000aa",
  sectionId: "s",
  title: "Giới thiệu",
  model: { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  status: "running",
  startedAt: new Date().toISOString(),
  deadlineAt: new Date(Date.now() + 300_000).toISOString(),
  ...overrides,
});

/** The workspace's part: it keeps the job and whether the dialog is open. */
function Harness({
  initialJob,
  sectionDraft = draft,
  onApplied = vi.fn(),
}: {
  initialJob?: AiJobView;
  sectionDraft?: SectionDraftState;
  onApplied?: () => void;
}) {
  const [current, setCurrent] = useState(initialJob);
  const [open, setOpen] = useState(false);
  return (
    <SectionAi
      sectionId="s"
      draft={sectionDraft}
      onApplied={onApplied}
      ai={{ job: current, open, setOpen, track: setCurrent, forget: () => setCurrent(undefined) }}
    />
  );
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("section AI dialog", () => {
  it.each(["geminiKeyRejected", "geminiRequestRejected"] as const)(
    "shows the specific %s failure when starting fails, without applying content",
    async (code) => {
      vi.mocked(previewSectionAiAction).mockResolvedValueOnce(preview());
      const message = `${t.errors[code]}\nGoogle: HTTP 400; INVALID_ARGUMENT; diagnostic`;
      vi.mocked(startSectionAiAction).mockResolvedValueOnce({
        ok: false,
        error: { code: "invalid_input", message },
      });
      const onApplied = vi.fn();
      render(<Harness onApplied={onApplied} />);
      fireEvent.click(screen.getByRole("button", { name: t.open }));
      const generate = await screen.findByRole("button", { name: t.generate });
      await waitFor(() => expect(generate).toBeEnabled());
      fireEvent.click(generate);
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(message));
      expect(onApplied).not.toHaveBeenCalled();
      expect(screen.queryByText(t.candidate)).not.toBeInTheDocument();
    },
  );

  it("explains missing configuration and disables generation", async () => {
    vi.mocked(previewSectionAiAction).mockResolvedValueOnce(
      preview({ configured: false, issues: ["geminiKeyMissing"] }),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    await waitFor(() => expect(screen.getByText(t.errors.geminiKeyMissing)).toBeVisible());
    await waitFor(() => expect(screen.getByRole("button", { name: t.generate })).toBeDisabled());
  });

  it("requires the manual draft to finish saving before opening AI", () => {
    render(<Harness sectionDraft={{ ...draft, status: "dirty" }} />);
    expect(screen.getByRole("button", { name: t.open })).toBeDisabled();
  });

  it("starts a background job: the dialog closes at once and reopens on its state", async () => {
    vi.mocked(previewSectionAiAction).mockResolvedValueOnce(preview());
    vi.mocked(startSectionAiAction).mockResolvedValueOnce({ ok: true, data: job() });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    const generate = await screen.findByRole("button", { name: t.generate });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    // Closed right away; the section button shows the running job.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(startSectionAiAction).toHaveBeenCalledTimes(1));
    const reopen = screen.getByRole("button", { name: t.job.running });
    expect(reopen).toBeEnabled();
    fireEvent.click(reopen);
    expect(await screen.findByText(t.job.closeKeepRunning)).toBeVisible();
    // Reopening never asks the provider again.
    expect(startSectionAiAction).toHaveBeenCalledTimes(1);
    expect(previewSectionAiAction).toHaveBeenCalledTimes(1);
  });

  it("shows a finished suggestion without applying it", async () => {
    const content = {
      type: "doc" as const,
      content: [
        { type: "paragraph" as const, content: [{ type: "text" as const, text: "Đề xuất." }] },
      ],
    };
    const onApplied = vi.fn();
    render(
      <Harness
        onApplied={onApplied}
        initialJob={job({
          status: "succeeded",
          result: {
            token: "00000000-0000-4000-8000-0000000000bb",
            content,
            stale: false,
            draftRevision: 1,
            expiresAt: new Date(Date.now() + 900_000).toISOString(),
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: t.job.ready }));
    expect(await screen.findByText("Đề xuất.")).toBeVisible();
    expect(onApplied).not.toHaveBeenCalled();
    expect(applySectionAiAction).not.toHaveBeenCalled();
  });

  it("types a fresh suggestion once, can show it all at once, and never replays it", async () => {
    const finished = job({
      status: "succeeded",
      result: {
        token: "00000000-0000-4000-8000-0000000000cc",
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Một câu khá dài." }] }],
        },
        stale: false,
        draftRevision: 1,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      },
    });
    markForTyping(finished.id);
    render(<Harness initialJob={finished} />);
    fireEvent.click(screen.getByRole("button", { name: t.job.ready }));
    fireEvent.click(await screen.findByRole("button", { name: t.showAll }));
    const candidate = screen.getByTestId("ai-candidate");
    expect(candidate.textContent).toBe("Một câu khá dài.");
    expect(screen.queryByRole("button", { name: t.showAll })).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: t.job.ready }));
    expect(await screen.findByTestId("ai-candidate")).toHaveTextContent("Một câu khá dài.");
    expect(screen.queryByRole("button", { name: t.showAll })).not.toBeInTheDocument();
  });

  it("shows why a job failed and offers to start over", async () => {
    render(
      <Harness
        initialJob={job({
          status: "failed",
          error: { code: "blocked", message: t.errors.blocked },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    expect(await screen.findByText(t.errors.blocked)).toBeVisible();
    expect(screen.getByText(t.job.draftKept)).toBeVisible();
    expect(screen.getByRole("button", { name: t.regenerate })).toBeEnabled();
  });
});

describe("AI job polling", () => {
  it("follows a running job until it finishes, reporting it once", async () => {
    vi.useFakeTimers();
    const running = job();
    const done = job({ status: "failed", error: { code: "timeout", message: t.errors.timeout } });
    vi.mocked(getSectionAiJobsAction)
      .mockResolvedValueOnce({ ok: true, data: [running] })
      .mockResolvedValueOnce({ ok: true, data: [done] });
    const onFinished = vi.fn();
    const { result } = renderHook(() => useAiJobs([running], onFinished));
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_INTERVAL_MS));
    expect(result.current.jobs.s?.status).toBe("running");
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_INTERVAL_MS));
    expect(result.current.jobs.s?.status).toBe("failed");
    expect(onFinished).toHaveBeenCalledExactlyOnceWith(done);
    // Nothing active: polling stops.
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_INTERVAL_MS * 3));
    expect(getSectionAiJobsAction).toHaveBeenCalledTimes(2);
  });

  it("treats a job the server no longer knows, or one past its deadline, as lost", async () => {
    vi.useFakeTimers();
    vi.mocked(getSectionAiJobsAction).mockResolvedValueOnce({ ok: true, data: [null] });
    const { result } = renderHook(() => useAiJobs([job()], vi.fn()));
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_INTERVAL_MS));
    expect(result.current.jobs.s).toMatchObject({ status: "failed", error: { code: "lost" } });

    const overdue = job({ deadlineAt: new Date(Date.now() - 120_000).toISOString() });
    vi.mocked(getSectionAiJobsAction).mockResolvedValueOnce({ ok: true, data: [overdue] });
    const second = renderHook(() => useAiJobs([overdue], vi.fn()));
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_INTERVAL_MS));
    expect(second.result.current.jobs.s).toMatchObject({
      status: "failed",
      error: { code: "lost" },
    });
  });
});

describe("model picker", () => {
  it("shows the server default and the model each job was fixed to", async () => {
    vi.mocked(previewSectionAiAction).mockResolvedValueOnce(preview());
    vi.mocked(startSectionAiAction).mockResolvedValueOnce({ ok: true, data: job() });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: t.open }));
    const picker = await screen.findByRole("combobox", { name: t.model.label });
    expect(picker).toHaveTextContent("Gemini 3.8 Flash");

    const generate = await screen.findByRole("button", { name: t.generate });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate);
    // Untouched picker: the server uses its own default (no client-chosen id is sent).
    await waitFor(() => expect(startSectionAiAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(startSectionAiAction).mock.calls[0]![0]).not.toHaveProperty("model");
    fireEvent.click(await screen.findByRole("button", { name: t.job.running }));
    expect(await screen.findByText(t.model.used("Gemini 3.8 Flash"))).toBeVisible();
  });
});
