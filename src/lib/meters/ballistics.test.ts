import { describe, expect, it } from "vitest";
import {
  BALLISTICS,
  clearClip,
  initialDisplay,
  stepDisplay,
  type DisplayState,
  type MeterInput,
} from "./ballistics";
import { decodeMeterFrame, reduceFrames, type MeterFrame } from "./frame";
import { formatHeldPeak } from "./readout";

const { floorDb } = BALLISTICS;

function input(overrides: Partial<MeterInput> = {}): MeterInput {
  return {
    bands: Array.from({ length: 30 }, () => floorDb),
    peak: [floorDb, floorDb],
    rms: [floorDb, floorDb],
    clip: [false, false],
    ...overrides,
  };
}

function bandsAt(db: number, index = 0): number[] {
  return Array.from({ length: 30 }, (_, i) => (i === index ? db : floorDb));
}

/** Runs the same input at `hz` draws per second for `seconds`. */
function run(
  state: DisplayState,
  next: MeterInput | null | ((t: number) => MeterInput | null),
  seconds: number,
  hz = 60,
): DisplayState {
  const steps = Math.round(seconds * hz);
  for (let i = 0; i < steps; i += 1) {
    const frame = typeof next === "function" ? next(i / hz) : next;
    state = stepDisplay(state, frame, 1 / hz);
  }
  return state;
}

describe("the bars", () => {
  it("rise instantly", () => {
    const state = stepDisplay(initialDisplay(), input({ bands: bandsAt(-12) }), 1 / 60);
    expect(state.bands[0]!.level).toBe(-12);
  });

  it("fall 30 dB/s in the Spectrum", () => {
    let state = stepDisplay(initialDisplay(), input({ bands: bandsAt(-10) }), 1 / 60);
    state = run(state, input(), 1);
    expect(state.bands[0]!.level).toBeCloseTo(-40, 6);
  });

  it("fall 8.6 dB/s in the Level meter, peak and RMS", () => {
    let state = stepDisplay(initialDisplay(), input({ peak: [-10, -10], rms: [-20, -20] }), 1 / 60);
    state = run(state, input(), 2);
    expect(state.peak[0].level).toBeCloseTo(-10 - 17.2, 6);
    expect(state.rms[0]).toBeCloseTo(-20 - 17.2, 6);
  });

  it("stop at the floor", () => {
    let state = stepDisplay(initialDisplay(), input({ bands: bandsAt(-80) }), 1 / 60);
    state = run(state, input(), 5);
    expect(state.bands[0]!.level).toBe(floorDb);
  });

  it("keep a level above full scale at the ceiling", () => {
    const state = stepDisplay(initialDisplay(), input({ bands: bandsAt(3), peak: [2, 0] }), 1 / 60);
    expect(state.bands[0]!.level).toBe(0);
    expect(state.peak[0].level).toBe(0);
  });

  it("fall to the floor when there is no frame (paused, stopped)", () => {
    let state = stepDisplay(initialDisplay(), input({ bands: bandsAt(-30) }), 1 / 60);
    state = run(state, null, 1);
    expect(state.bands[0]!.level).toBeCloseTo(-60, 6);
    state = run(state, null, 3);
    expect(state.bands[0]!.level).toBe(floorDb);
  });
});

describe("the caps", () => {
  it("follow the bar upward", () => {
    const state = stepDisplay(initialDisplay(), input({ bands: bandsAt(-20) }), 1 / 60);
    expect(state.bands[0]!.peakCap).toBe(-20);
  });

  it("hold for 1.5 s, then fall 10 dB/s", () => {
    let state = stepDisplay(initialDisplay(), input({ bands: bandsAt(-20) }), 1 / 60);
    state = run(state, input(), 1.4);
    expect(state.bands[0]!.peakCap).toBe(-20);
    state = run(state, input(), 0.1 + 1);
    expect(state.bands[0]!.peakCap).toBeCloseTo(-30, 6);
  });

  it("never fall below their bar", () => {
    let state = stepDisplay(initialDisplay(), input({ bands: bandsAt(-20) }), 1 / 60);
    // A steady signal for longer than the hold keeps the Peak cap on the Level bar.
    state = run(state, input({ bands: bandsAt(-15) }), 5);
    expect(state.bands[0]!.peakCap).toBe(-15);
    state = run(state, input({ bands: bandsAt(-89) }), 20);
    expect(state.bands[0]!.peakCap).toBeGreaterThanOrEqual(state.bands[0]!.level);
  });

  it("restart their hold when the bar touches them again", () => {
    let state = stepDisplay(initialDisplay(), input({ bands: bandsAt(-20) }), 1 / 60);
    state = run(state, input(), 1);
    state = stepDisplay(state, input({ bands: bandsAt(-20) }), 1 / 60);
    state = run(state, input(), 1.4);
    expect(state.bands[0]!.peakCap).toBe(-20);
  });

  it("are held on the Level meter peak too", () => {
    let state = stepDisplay(initialDisplay(), input({ peak: [-6, -9] }), 1 / 60);
    state = run(state, input(), 1);
    expect(state.peak[0].peakCap).toBe(-6);
    expect(state.peak[1].peakCap).toBe(-9);
  });
});

describe("time", () => {
  it("gives the same level at the same moment at 60, 120 and 144 Hz", () => {
    const signal = (t: number) => (t < 0.5 ? input({ bands: bandsAt(-10), peak: [-6, -6] }) : null);
    const [first, ...others] = [60, 120, 144].map((hz) => {
      const state = run(initialDisplay(), signal, 2, hz);
      return [
        state.bands[0]!.level,
        state.bands[0]!.peakCap,
        state.peak[0].level,
        state.peak[0].peakCap,
      ];
    });
    for (const other of others) {
      other.forEach((value, i) => expect(value).toBeCloseTo(first![i]!, 6));
    }
  });

  it("caps a stall so it does not jump", () => {
    let state = stepDisplay(initialDisplay(), input({ bands: bandsAt(-10) }), 1 / 60);
    state = stepDisplay(state, null, 30);
    expect(state.bands[0]!.level).toBeCloseTo(-10 - 30 * BALLISTICS.maxElapsedS, 6);
  });
});

describe("clip", () => {
  const clipping = input({ peak: [0, -6], clip: [true, false] });

  it("latches the channel that clipped for 2 s", () => {
    let state = stepDisplay(initialDisplay(), clipping, 1 / 60);
    expect(state.clip).toEqual([true, false]);
    state = run(state, input(), 1.9);
    expect(state.clip[0]).toBe(true);
    state = run(state, input(), 0.2);
    expect(state.clip[0]).toBe(false);
  });

  it("restarts the 2 s on a new clip", () => {
    let state = stepDisplay(initialDisplay(), clipping, 1 / 60);
    state = run(state, input(), 1.5);
    state = stepDisplay(state, clipping, 1 / 60);
    state = run(state, input(), 1.5);
    expect(state.clip[0]).toBe(true);
    state = run(state, input(), 0.6);
    expect(state.clip[0]).toBe(false);
  });

  it("clears on click, one channel at a time", () => {
    let state = stepDisplay(initialDisplay(), input({ peak: [0, 0], clip: [true, true] }), 1 / 60);
    state = clearClip(state, 0);
    expect(state.clip).toEqual([false, true]);
  });
});

describe("frames", () => {
  const frame = (overrides: Partial<MeterFrame>): MeterFrame => ({
    bands: bandsAt(floorDb),
    peak: [floorDb, floorDb],
    rms: [floorDb, floorDb],
    fullScale: false,
    ...overrides,
  });

  it("reduce to their maximum so a short peak is not lost", () => {
    const reduced = reduceFrames([
      frame({ bands: bandsAt(-40), peak: [-30, -50], rms: [-35, -35] }),
      frame({ bands: bandsAt(-10), peak: [-6, -50], rms: [-33, -33] }),
      frame({ bands: bandsAt(-60), peak: [-40, -45], rms: [-32, -32] }),
    ])!;
    expect(reduced.bands[0]).toBe(-10);
    expect(reduced.peak).toEqual([-6, -45]);
    // RMS follows the latest frame.
    expect(reduced.rms).toEqual([-32, -32]);
  });

  it("flag a clip on the channel whose peak reached full scale", () => {
    const reduced = reduceFrames([frame({ peak: [0, -20], fullScale: true })])!;
    expect(reduced.clip).toEqual([true, false]);
    expect(reduceFrames([frame({ peak: [0, 0], fullScale: false })])!.clip).toEqual([false, false]);
  });

  it("reduce to nothing when there are none", () => {
    expect(reduceFrames([])).toBeNull();
  });

  it("decode from the wire layout", () => {
    const buffer = new ArrayBuffer(35 * 4);
    const view = new DataView(buffer);
    for (let i = 0; i < 30; i += 1) view.setFloat32(i * 4, -i, true);
    view.setFloat32(30 * 4, -3, true);
    view.setFloat32(31 * 4, -4, true);
    view.setFloat32(32 * 4, -5, true);
    view.setFloat32(33 * 4, -6, true);
    view.setUint32(34 * 4, 1, true);
    const decoded = decodeMeterFrame(buffer)!;
    expect(decoded.bands[7]).toBe(-7);
    expect(decoded.peak).toEqual([-3, -4]);
    expect(decoded.rms).toEqual([-5, -6]);
    expect(decoded.fullScale).toBe(true);
    expect(decodeMeterFrame(new ArrayBuffer(8))).toBeNull();
  });
});

describe("formatHeldPeak", () => {
  it("shows one decimal in dBFS", () => {
    expect(formatHeldPeak(-6.04)).toBe("-6.0");
    expect(formatHeldPeak(-12.36)).toBe("-12.4");
  });

  it("shows -inf at the floor", () => {
    expect(formatHeldPeak(floorDb)).toBe("-inf");
    expect(formatHeldPeak(-89.97)).toBe("-inf");
  });

  it("never shows a negative zero", () => {
    expect(formatHeldPeak(-0.02)).toBe("0.0");
    expect(formatHeldPeak(0)).toBe("0.0");
  });
});
