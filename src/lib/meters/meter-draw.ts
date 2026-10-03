import { BALLISTICS, type Bar } from "./ballistics";

/** The dB values with a tick on the shared axis. */
export const AXIS_TICKS = [0, -20, -40, -60, -80] as const;

const { floorDb } = BALLISTICS;

/** Where `db` sits along a bar of `length`, from the floor (0) to full scale (`length`). */
const along = (db: number, length: number) =>
  ((Math.min(0, Math.max(floorDb, db)) - floorDb) / -floorDb) * length;

/** Opacity of each part, all of one foreground colour: the meter is white, never tinted. */
const TRACK_ALPHA = 0.035;
const GRID_ALPHA = 0.07;
const BAR_ALPHA = 0.78;
const EXTENSION_ALPHA = 0.3;
const CAP_PX = 1.5;

type Orientation = "vertical" | "horizontal";

function grid(c: CanvasRenderingContext2D, w: number, h: number, orientation: Orientation) {
  c.globalAlpha = GRID_ALPHA;
  for (const db of AXIS_TICKS) {
    if (orientation === "vertical") {
      const y = h - along(db, h);
      c.fillRect(0, Math.min(h - 1, y), w, 1);
    } else {
      const x = along(db, w);
      c.fillRect(Math.min(w - 1, x), 0, 1, h);
    }
  }
  c.globalAlpha = 1;
}

/** One Bar: its faint track, `extendTo` (the peak above the RMS) as a dimmer segment, the level, and the Cap. */
function bar(
  c: CanvasRenderingContext2D,
  orientation: Orientation,
  offset: number,
  thickness: number,
  length: number,
  level: number,
  cap: number,
  extendTo?: number,
) {
  const rect = (from: number, to: number): [number, number, number, number] =>
    orientation === "vertical"
      ? [offset, length - to, thickness, to - from]
      : [from, offset, to - from, thickness];

  c.globalAlpha = TRACK_ALPHA;
  c.fillRect(...rect(0, length));
  if (extendTo !== undefined && extendTo > level) {
    c.globalAlpha = EXTENSION_ALPHA;
    c.fillRect(...rect(along(level, length), along(extendTo, length)));
  }
  c.globalAlpha = BAR_ALPHA;
  c.fillRect(...rect(0, along(level, length)));
  if (cap > floorDb + 1) {
    const at = Math.min(length - CAP_PX, along(cap, length));
    c.globalAlpha = 1;
    c.fillRect(...rect(at, at + CAP_PX));
  }
  c.globalAlpha = 1;
}

/** Clears a canvas and sets the one colour everything is drawn in. */
function begin(c: CanvasRenderingContext2D, w: number, h: number, color: string) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = color;
}

export function drawSpectrum(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  bands: readonly Bar[],
) {
  begin(c, w, h, color);
  grid(c, w, h, "vertical");
  const pitch = w / bands.length;
  const thickness = Math.max(2, pitch * 0.3);
  const offset = (pitch - thickness) / 2;
  bands.forEach((band, i) =>
    bar(c, "vertical", i * pitch + offset, thickness, h, band.level, band.cap),
  );
}

/** One channel of the Level meter: the RMS bar, with the peak above it and the held peak as the cap. */
export function drawLevel(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  peak: Bar,
  rms: number,
) {
  const orientation: Orientation = w > h ? "horizontal" : "vertical";
  const length = orientation === "horizontal" ? w : h;
  const across = orientation === "horizontal" ? h : w;
  begin(c, w, h, color);
  grid(c, w, h, orientation);
  const thickness = orientation === "horizontal" ? across * 0.4 : Math.min(across * 0.5, 14);
  bar(c, orientation, (across - thickness) / 2, thickness, length, rms, peak.cap, peak.level);
}
