import { GROOVE_TURNS, grooveStrip, type GrooveRun } from "./groove-model";

/** Where the groove sits, as shares of the disc's radius (see DESIGN.md, Now Playing). */
export const GROOVE_OUTER = 0.96;
export const GROOVE_INNER = 0.42;

/** The groove strips for `peaks` on a disc of `sizePx`, optionally only for a stretch of the track. */
export function computeGroove(
  peaks: readonly number[],
  sizePx: number,
  range?: readonly [number, number],
): GrooveRun[] {
  const radius = sizePx / 2;
  return grooveStrip(
    peaks,
    GROOVE_TURNS,
    GROOVE_OUTER * radius,
    GROOVE_INNER * radius,
    undefined,
    range,
  );
}

/** Fills `runs` into a canvas whose backing store is `sizePx * dpr` square, centre at the middle. */
export function paintGroove(
  canvas: HTMLCanvasElement,
  sizePx: number,
  dpr: number,
  layers: readonly { runs: readonly GrooveRun[]; color: string }[],
) {
  canvas.width = Math.round(sizePx * dpr);
  canvas.height = Math.round(sizePx * dpr);
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.setTransform(dpr, 0, 0, dpr, (sizePx * dpr) / 2, (sizePx * dpr) / 2);
  for (const { runs, color } of layers) {
    const path = new Path2D();
    for (const run of runs) {
      const [start, ...rest] = run.outer;
      if (start === undefined) continue;
      path.moveTo(start[0], start[1]);
      for (const point of rest) path.lineTo(point[0], point[1]);
      for (let i = run.inner.length - 1; i >= 0; i -= 1) {
        path.lineTo(run.inner[i]![0], run.inner[i]![1]);
      }
      path.closePath();
    }
    ctx.fillStyle = color;
    ctx.fill(path);
  }
}
