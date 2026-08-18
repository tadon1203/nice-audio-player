import type { LyricsTimedLine } from "@/bindings";

export interface ActiveLyricsGroup {
  startMs: number;
  indices: number[];
  clears: boolean;
  ordinal: number;
}

export interface LyricsCueGroup {
  startMs: number;
  ordinal: number;
  indices: number[];
  clears: boolean;
}

export function groupTimedLyrics(lines: LyricsTimedLine[]): LyricsCueGroup[] {
  const groups: LyricsCueGroup[] = [];
  for (let index = 0; index < lines.length;) {
    const startMs = lines[index]!.startMs;
    const indices: number[] = [];
    while (index < lines.length && lines[index]!.startMs === startMs) indices.push(index++);
    groups.push({
      startMs,
      ordinal: groups.length,
      indices,
      clears: indices.every((lineIndex) => lines[lineIndex]?.text === ""),
    });
  }
  return groups;
}

export function activeLyricsGroup(
  lines: LyricsTimedLine[],
  positionMs: number,
): ActiveLyricsGroup | null {
  const groups = groupTimedLyrics(lines);
  let low = 0;
  let high = groups.length - 1;
  let match = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if ((groups[middle]?.startMs ?? Infinity) <= positionMs) {
      match = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  if (match < 0) return null;
  return groups[match]!;
}
