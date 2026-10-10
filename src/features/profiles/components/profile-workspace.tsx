"use client";

import { useId, useReducer, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addSectionAction,
  reorderSectionsAction,
  updateSectionAction,
} from "@/features/profiles/actions";
import type { SourceGroupOption } from "@/features/profiles/fact-sources";
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

import { ProfileHeader, type WorkspaceView } from "./profile-header";
import { ProfilePreview } from "./profile-preview";
import { AddSectionDialog, RenameSectionDialog, SourcesDialog } from "./section-dialogs";
import { SectionNav } from "./section-nav";
import { SectionPanel } from "./section-panel";
import { useSectionAutosave } from "./use-section-autosave";

const t = messages.profiles;

type Dialog =
  | { kind: "add" }
  | { kind: "rename"; section: SectionStructureView }
  | { kind: "sources"; section: SectionStructureView }
  | null;

/**
 * Profile workspace: section list, rich text editor of the selected section (draft), approval,
 * history and a full preview. Structure changes (add, rename, reorder, hide, sources) are
 * explicit actions guarded by the profile revision; section content autosaves on its own.
 */
export function ProfileWorkspace({
  name,
  profile,
  sourceGroups,
  initialSection,
}: {
  name: string;
  profile: ProfileView;
  sourceGroups: SourceGroupOption[];
  initialSection?: string;
}) {
  const idPrefix = useId();
  const [state, dispatch] = useReducer(workspaceReducer, profile, (value) =>
    createWorkspaceState(value, initialSection),
  );
  const [view, setView] = useState<WorkspaceView>("edit");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, startStructure] = useTransition();
  const isClient = useIsClient();
  const { saveNow } = useSectionAutosave(state, dispatch);

  const unsaved = unsavedSections(state);
  useUnsavedChangesGuard(unsaved.length > 0, t.leaveWarning);

  const active = state.sections.find((section) => section.id === state.activeId);
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
        view={view}
        onViewChange={setView}
        onRetry={() => active && saveNow(active.id)}
      />

      {view === "preview" ? (
        <ProfilePreview name={name} sections={state.sections} drafts={state.drafts} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
          <aside className="lg:sticky lg:top-36 lg:self-start">
            <SectionNav
              sections={state.sections}
              statuses={statuses}
              activeId={state.activeId}
              onSelect={(sectionId) => dispatch({ type: "select", sectionId })}
              commands={commands}
            />
          </aside>
          {active && activeDraft ? (
            <SectionPanel
              key={active.id}
              characterId={profile.characterId}
              section={active}
              draft={activeDraft}
              sourceGroups={sourceGroups}
              idPrefix={idPrefix}
              dispatch={dispatch}
              onEditSources={() => setDialog({ kind: "sources", section: active })}
            />
          ) : null}
        </div>
      )}

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
