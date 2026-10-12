"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { FadeIn } from "@/components/shared/fade-in";
import {
  addSectionAction,
  reorderSectionsAction,
  updateSectionAction,
} from "@/features/profiles/actions";
import { applySectionAiAction } from "@/features/profiles/ai/actions";
import type { AiJobView } from "@/features/profiles/ai/service";
import type { SourceGroupOption } from "@/features/profiles/fact-sources";
import { summarizePrint } from "@/features/profiles/print";
import {
  defaultSectionLabel,
  type ProfileStructureView,
  type ProfileView,
  sectionLabel,
  type SectionStructureView,
} from "@/features/profiles/view";
import {
  createWorkspaceState,
  statusOfSection,
  unsavedSections,
  workspaceReducer,
} from "@/features/profiles/workspace/state";
import { useIsClient } from "@/hooks/use-is-client";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-guard";
import { messages } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";

import { ProfileHeader } from "./profile-header";
import { PrintDialog } from "./print-dialog";
import { draftTypingKey, markForTyping } from "./rich-text-typing";
import { AddSectionDialog, RenameSectionDialog, SourcesDialog } from "./section-dialogs";
import { SectionNav } from "./section-nav";
import { SectionPanel } from "./section-panel";
import { isActiveJob, useAiJobs } from "./use-ai-jobs";
import { useSectionAutosave } from "./use-section-autosave";

const t = messages.profiles;

type Dialog =
  | { kind: "add" }
  | { kind: "rename"; section: SectionStructureView }
  | { kind: "sources"; section: SectionStructureView }
  | null;

/**
 * Profile workspace: section list, rich text editor of the selected section (draft), approval,
 * and history. Structure changes (add, rename, reorder, hide, sources) are
 * explicit actions guarded by the profile revision; section content autosaves on its own.
 */
export function ProfileWorkspace({
  name,
  profile,
  sourceGroups,
  initialSection,
  initialAiJobs = [],
}: {
  name: string;
  profile: ProfileView;
  sourceGroups: SourceGroupOption[];
  initialSection?: string;
  /** AI jobs the server still knows for these sections (restored after leaving the page). */
  initialAiJobs?: AiJobView[];
}) {
  const idPrefix = useId();
  const [state, dispatch] = useReducer(workspaceReducer, profile, (value) =>
    createWorkspaceState(value, initialSection),
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, startStructure] = useTransition();
  const isClient = useIsClient();
  const { saveNow } = useSectionAutosave(state, dispatch);
  const [aiOpenFor, setAiOpenFor] = useState<string | null>(null);
  const openAi = useCallback((sectionId: string) => {
    dispatch({ type: "select", sectionId });
    setAiOpenFor(sectionId);
  }, []);
  // Read by the AI callbacks below, which run outside render (polling, a resolved action).
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });
  const forgetAiJob = useRef<(sectionId: string) => void>(() => {});
  const applyingAi = useRef(new Set<string>());

  /**
   * Write a finished suggestion straight into the section's draft (the server keeps the previous
   * draft in the history). Only when it is safe: the draft is saved and unchanged since the job
   * started, and the source facts did not change. Otherwise the suggestion stays in the AI dialog
   * for the user to review. Returns whether it was written.
   */
  const autoApplyAi = useCallback(async (job: AiJobView): Promise<boolean> => {
    const result = job.status === "succeeded" ? job.result : undefined;
    if (!result || result.stale || applyingAi.current.has(job.id)) return false;
    const draft = stateRef.current.drafts[job.sectionId];
    const saved = draft?.status === "idle" || draft?.status === "saved";
    if (!saved || draft.draftRevision !== result.draftRevision) return false;
    applyingAi.current.add(job.id);
    try {
      const applied = await applySectionAiAction({ token: result.token, confirmStale: false });
      if (!applied.ok) return false;
      const { content, draftRevision, savedAt } = applied.data;
      markForTyping(draftTypingKey(job.sectionId, draftRevision));
      dispatch({ type: "replaced", sectionId: job.sectionId, content, draftRevision, savedAt });
      forgetAiJob.current(job.sectionId);
      setAiOpenFor((current) => (current === job.sectionId ? null : current));
      return true;
    } catch {
      return false;
    }
  }, []);

  const onAiFinished = useCallback(
    (job: AiJobView) => {
      const action = { label: messages.profileAi.job.view, onClick: () => openAi(job.sectionId) };
      if (job.status === "succeeded") {
        void autoApplyAi(job).then((written) =>
          written
            ? toast.success(messages.profileAi.job.written(job.title))
            : toast.success(messages.profileAi.job.finished(job.title), { action }),
        );
      } else if (job.status === "failed")
        toast.error(messages.profileAi.job.failed(job.title), { action });
    },
    [openAi, autoApplyAi],
  );
  const aiJobs = useAiJobs(initialAiJobs, onAiFinished);
  useLayoutEffect(() => {
    forgetAiJob.current = aiJobs.forget;
  }, [aiJobs.forget]);
  // Suggestions that finished while the page was closed are written the same way on return.
  const [finishedBeforeLoad] = useState(() =>
    initialAiJobs.filter((job) => job.status === "succeeded"),
  );
  useEffect(() => {
    // Asynchronous by nature (a Server Action); state only changes once it has answered.
    const run = async () => {
      for (const job of finishedBeforeLoad) {
        if (await autoApplyAi(job)) toast.success(messages.profileAi.job.written(job.title));
      }
    };
    void run();
  }, [finishedBeforeLoad, autoApplyAi]);
  const aiBadges: Record<string, "running" | "ready"> = {};
  for (const job of Object.values(aiJobs.jobs)) {
    if (isActiveJob(job)) aiBadges[job.sectionId] = "running";
    else if (job.status === "succeeded") aiBadges[job.sectionId] = "ready";
  }

  const unsaved = unsavedSections(state);
  useUnsavedChangesGuard(unsaved.length > 0, t.leaveWarning);

  const active = state.sections.find((section) => section.id === state.activeId);
  const activeKey = active?.key;
  // Mirror the selected section in the URL (`?section=<key>`): the page re-keys this workspace
  // whenever stored content changes (e.g. applying an AI suggestion refreshes the route), and
  // the new instance starts from that parameter instead of jumping back to the first section.
  useEffect(() => {
    if (!activeKey) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("section") === activeKey) return;
    url.searchParams.set("section", activeKey);
    window.history.replaceState(null, "", url);
  }, [activeKey]);
  const activeDraft = active ? state.drafts[active.id] : undefined;
  const statuses = Object.fromEntries(
    state.sections.map((section) => [section.id, statusOfSection(state.drafts[section.id]!)]),
  );

  /** Run a structure action; returns an error message for dialogs, or null on success. */
  const applyStructure = async (
    run: () => Promise<ActionResult<ProfileStructureView & { sectionId?: string }>>,
  ): Promise<string | null> => {
    try {
      const result = await run();
      if (!result.ok) {
        if (result.error.code === "revision_conflict") {
          toast.error(t.structureConflict);
          return t.structureConflict;
        }
        return result.error.fieldErrors?.title ?? result.error.message;
      }
      dispatch({ type: "structure", structure: result.data, select: result.data.sectionId });
      return null;
    } catch {
      return t.status.offline;
    }
  };

  const target = { characterId: profile.characterId, profileId: state.profileId };

  const runCommand = (run: () => Promise<ActionResult<ProfileStructureView>>) =>
    startStructure(async () => {
      const message = await applyStructure(run);
      if (message && message !== t.structureConflict) toast.error(message);
    });

  const commands = {
    busy,
    onAdd: () => setDialog({ kind: "add" }),
    onRename: (section: SectionStructureView) => setDialog({ kind: "rename", section }),
    onEditSources: (section: SectionStructureView) => setDialog({ kind: "sources", section }),
    onToggleHidden: (section: SectionStructureView) =>
      runCommand(() =>
        updateSectionAction({
          ...target,
          revision: state.revision,
          sectionId: section.id,
          update: { isHidden: !section.isHidden },
        }),
      ),
    onMove: (section: SectionStructureView, direction: -1 | 1) => {
      const order = state.sections.map((item) => item.id);
      const from = order.indexOf(section.id);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to]!, order[from]!];
      runCommand(() =>
        reorderSectionsAction({ profileId: state.profileId, revision: state.revision, order }),
      );
    },
  };

  return (
    <div
      className="space-y-6"
      data-profile-workspace
      // Hydration marker for E2E tests: interacting earlier would hit server HTML.
      data-ready={isClient || undefined}
    >
      <ProfileHeader
        characterId={profile.characterId}
        name={name}
        active={activeDraft}
        otherUnsaved={unsaved.filter((id) => id !== state.activeId).length}
        onRetry={() => active && saveNow(active.id)}
        printAction={
          <PrintDialog
            characterId={profile.characterId}
            summaries={summarizePrint(
              state.sections.map((section) => ({
                ...section,
                // What the database holds: the print view reads stored content only.
                draft: state.drafts[section.id]?.saved ?? null,
                approved: state.drafts[section.id]?.approved ?? null,
              })),
            )}
            unsaved={unsaved.length}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <aside className="lg:sticky lg:top-36 lg:self-start">
          <SectionNav
            sections={state.sections}
            statuses={statuses}
            aiBadges={aiBadges}
            activeId={state.activeId}
            onSelect={(sectionId) => dispatch({ type: "select", sectionId })}
            commands={commands}
          />
        </aside>
        {active && activeDraft ? (
          <FadeIn key={active.id} className="min-w-0">
            <SectionPanel
              characterId={profile.characterId}
              section={active}
              draft={activeDraft}
              sourceGroups={sourceGroups}
              idPrefix={idPrefix}
              dispatch={dispatch}
              onEditSources={() => setDialog({ kind: "sources", section: active })}
              ai={{
                job: aiJobs.jobs[active.id],
                open: aiOpenFor === active.id,
                setOpen: (open) => setAiOpenFor(open ? active.id : null),
                track: aiJobs.track,
                forget: () => aiJobs.forget(active.id),
              }}
            />
          </FadeIn>
        ) : null}
      </div>

      {dialog?.kind === "add" && (
        <AddSectionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          groups={sourceGroups}
          onSubmit={(input) =>
            applyStructure(() =>
              addSectionAction({ ...target, revision: state.revision, ...input }),
            )
          }
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameSectionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          initialTitle={sectionLabel(dialog.section)}
          defaultLabel={defaultSectionLabel(dialog.section.key)}
          onSubmit={(title) =>
            applyStructure(() =>
              updateSectionAction({
                ...target,
                revision: state.revision,
                sectionId: dialog.section.id,
                update: { title },
              }),
            )
          }
        />
      )}
      {dialog?.kind === "sources" && (
        <SourcesDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          sectionTitle={sectionLabel(dialog.section)}
          groups={sourceGroups}
          initial={dialog.section.sourceGroups}
          onSubmit={(groups) =>
            applyStructure(() =>
              updateSectionAction({
                ...target,
                revision: state.revision,
                sectionId: dialog.section.id,
                update: { sourceGroups: groups },
              }),
            )
          }
        />
      )}
    </div>
  );
}
