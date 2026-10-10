import { describe, expect, it } from "vitest";

import { contentHash, emptyDocument, type RichTextDocument } from "./domain";
import type { FactFreshness } from "./fact-sources";
import { profileProgress, type SectionView } from "./view";

const doc = (text: string): RichTextDocument => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

function section(
  key: string,
  draft: RichTextDocument | null,
  approved: RichTextDocument | null,
  options: { hidden?: boolean; facts?: FactFreshness; title?: string } = {},
): SectionView {
  return {
    id: key,
    key,
    title: options.title ?? null,
    isHidden: options.hidden ?? false,
    sourceGroups: [],
    draft,
    draftRevision: 2,
    draftUpdatedAt: null,
    approved: approved
      ? {
          revisionId: `rev-${key}`,
          content: approved,
          hash: contentHash(approved),
          approvedAt: "2026-10-10T08:00:00.000Z",
          facts: options.facts ?? { status: "fresh" },
        }
      : null,
  };
}

describe("profileProgress", () => {
  it("counts visible sections only, with the workspace's status and staleness rules", () => {
    const progress = profileProgress({
      id: "p",
      characterId: "c",
      revision: 1,
      sections: [
        section("intro", doc("A"), doc("A")),
        section("appearance", doc("B mới"), doc("B"), {
          facts: { status: "outdated", labels: ["Màu tóc"] },
        }),
        section("personality", doc("Chưa duyệt"), null),
        section("psychology", emptyDocument(), null),
        section("behavior", null, null),
        section("background", doc("Ẩn"), doc("Ẩn cũ"), {
          hidden: true,
          facts: { status: "outdated", labels: ["Quê quán"] },
        }),
        section("ps_magic01", doc("C"), doc("C"), {
          title: "Phép thuật",
          facts: { status: "incomparable" },
        }),
      ],
    });
    expect(progress).toEqual({
      sections: 6,
      approved: 3,
      // appearance (changed since approval) and personality (never approved).
      pending: 2,
      outdated: [{ key: "appearance", title: "Ngoại hình" }],
    });
  });
});
