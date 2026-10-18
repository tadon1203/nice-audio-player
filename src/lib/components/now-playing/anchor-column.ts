/** Where a scrolling column's "now" sits, and the spacers and scroll offset that put it there. */
export class AnchorColumn {
  /** Where "now" sits in a scrolling column: this fraction of its height from the top. */
  public static readonly fraction = 0.4;

  /** Hides the scrollbar of a lyrics or queue column; the reader scrolls it by wheel or keys. */
  public static readonly edgeMask = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  /**
   * The spacers that let a column's first and last rows reach the anchor line: `top` (40% of the
   * height) before the rows and `bottom` (the other 60%) after them.
   */
  public static spacers(height: number): { top: number; bottom: number } {
    return {
      top: height * AnchorColumn.fraction,
      bottom: height * (1 - AnchorColumn.fraction),
    };
  }

  /** The scroll offset that puts the centre of a row on the anchor line, kept inside the scroll range. */
  public static scrollTop({
    rowTop,
    rowHeight,
    clientHeight,
    scrollHeight,
  }: {
    rowTop: number;
    rowHeight: number;
    clientHeight: number;
    scrollHeight: number;
  }): number {
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const target = rowTop + rowHeight / 2 - clientHeight * AnchorColumn.fraction;
    return Math.max(0, Math.min(target, maxScroll));
  }
}
