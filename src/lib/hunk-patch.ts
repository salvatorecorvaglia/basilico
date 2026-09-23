/* ═══════════════════════════════════════════════════════
   Basilico — Hunk Patch Construction
   Builds a unified diff for staging or unstaging part of a hunk
   ═══════════════════════════════════════════════════════ */

import type { DiffHunkInfo } from "./git-types";

/**
 * Build a unified-diff patch that applies part (or all) of `hunk`.
 *
 * A hunk classifies its lines against two images: the *old* side (what the
 * pre-image contains) and the *new* side. Context lines are in both, `+` lines
 * only in the new side, `-` lines only in the old side.
 *
 * Staging applies the selected changes forward, so the patch's pre-image is
 * the old side. Unstaging applies them backwards, so the patch's pre-image is
 * the **new** side — and that inverts which unselected lines survive as
 * context:
 *
 * | line | forward, unselected | reverse, unselected |
 * |------|---------------------|---------------------|
 * | `+`  | omitted (not in either image) | context (in both) |
 * | `-`  | context (in both)   | omitted (not in either image) |
 *
 * The previous implementation applied the forward rule in both directions, so
 * an unselected deletion was emitted as context in a reverse patch even though
 * that line does not exist on the reverse patch's pre-image, and an unselected
 * addition was dropped even though it does. It also computed the line-count
 * delta for the forward direction and then wrote it into the reversed header's
 * *old* slot. Selectively unstaging therefore produced a patch git either
 * rejected or applied against mismatched offsets.
 *
 * Expressing it as "which origin plays the removal role" makes the two
 * directions the same algorithm with `+`/`-` swapped.
 *
 * @param selectedLineIndices Indices into `hunk.lines` to include. Omit to
 *   apply the whole hunk.
 * @param reverse `true` to undo the change (unstage) rather than apply it.
 */
export function constructHunkPatch(
  filePath: string,
  hunk: DiffHunkInfo,
  selectedLineIndices?: Set<number>,
  reverse = false,
): string {
  // In reverse, an addition is what gets removed and a deletion is what gets
  // restored, so the two roles swap.
  const removalOrigin = reverse ? "+" : "-";
  const additionOrigin = reverse ? "-" : "+";

  const isSelected = (idx: number) =>
    selectedLineIndices ? selectedLineIndices.has(idx) : true;

  let oldCount = 0;
  let newCount = 0;
  let body = "";

  const emit = (marker: string, content: string) => {
    // libgit2 includes the trailing newline in a line's content, except for a
    // final line that genuinely lacks one. Terminating explicitly stops that
    // last line from gluing onto whatever follows it in the patch, and the
    // marker below is what git itself writes in that situation.
    if (content.endsWith("\n")) {
      body += `${marker}${content}`;
    } else {
      body += `${marker}${content}\n\\ No newline at end of file\n`;
    }
  };

  hunk.lines.forEach((line, idx) => {
    if (line.origin === " ") {
      oldCount++;
      newCount++;
      emit(" ", line.content);
      return;
    }

    if (line.origin === removalOrigin) {
      if (isSelected(idx)) {
        // Present in the pre-image, removed by this patch.
        oldCount++;
        emit("-", line.content);
      } else {
        // Left alone: present in the pre-image and still present after.
        oldCount++;
        newCount++;
        emit(" ", line.content);
      }
      return;
    }

    if (line.origin === additionOrigin) {
      if (isSelected(idx)) {
        // Absent from the pre-image, introduced by this patch.
        newCount++;
        emit("+", line.content);
      }
      // Unselected: absent from both images, so it appears in neither the
      // body nor the counts.
      return;
    }

    // Any other origin (libgit2's newline-marker pseudo-lines) carries no
    // content of its own and is handled by `emit` above.
  });

  const oldStart = reverse ? hunk.newStart : hunk.oldStart;
  const newStart = reverse ? hunk.oldStart : hunk.newStart;

  return (
    `diff --git a/${filePath} b/${filePath}\n` +
    `--- a/${filePath}\n` +
    `+++ b/${filePath}\n` +
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n` +
    body
  );
}
