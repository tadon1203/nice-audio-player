const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Splits text into user-perceived characters (combining marks, emoji ZWJ, dakuten stay whole). */
export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}
