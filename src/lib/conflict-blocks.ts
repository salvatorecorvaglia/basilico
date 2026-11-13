/** A complete two-way or three-way Git conflict block, indexed by line. */
export interface ConflictBlock {
  start: number;
  sep: number;
  end: number;
  ours: string;
  theirs: string;
}

/** Only structurally complete blocks are offered for automatic resolution. */
export function parseConflictBlocks(
  content: string,
  markerSize = 7,
): ConflictBlock[] {
  const lines = content.split("\n");
  const blocks: ConflictBlock[] = [];
  let start = -1;
  let base = -1;
  let sep = -1;
  let size = 0;
  let malformed = false;
  for (let i = 0; i < lines.length; i++) {
    const marker = /^(<+|\|+|=+|>+)(?:\s.*)?$/.exec(lines[i]);
    if (!marker) continue;
    if (marker[1].length < 3 && marker[1].length !== markerSize) continue;
    const kind = marker[1][0];
    const length = marker[1].length;
    if (kind === "<") {
      if (start !== -1) malformed = true;
      else {
        start = i;
        size = length;
        base = -1;
        sep = -1;
      }
    } else if (start !== -1) {
      if (length !== size) {
        malformed = true;
        continue;
      }
      if (kind === "|") {
        if (base !== -1 || sep !== -1) malformed = true;
        base = i;
      } else if (kind === "=") {
        if (sep !== -1) malformed = true;
        sep = i;
      } else {
        if (!malformed && sep !== -1) {
          blocks.push({
            start,
            sep,
            end: i,
            ours: lines.slice(start + 1, base === -1 ? sep : base).join("\n"),
            theirs: lines.slice(sep + 1, i).join("\n"),
          });
        }
        start = -1;
        malformed = false;
      }
    }
  }
  return blocks;
}

export function hasConflictMarkers(content: string, markerSize = 7): boolean {
  return content.split("\n").some((line) => {
    const marker = /^(<+|>+|\|+)(?:\s.*)?$/.exec(line);
    return (
      !!marker && (marker[1].length >= 3 || marker[1].length === markerSize)
    );
  });
}
