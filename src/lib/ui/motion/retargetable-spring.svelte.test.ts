import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetargetableSpring } from "./retargetable-spring.svelte";

const reduced = vi.hoisted(() => ({ current: false }));
vi.mock("svelte/motion", () => ({ prefersReducedMotion: reduced }));

let clock = 0;
let callbacks = new Map<number, () => void>();
let nextId = 1;

beforeEach(() => {
  clock = 1000;
  callbacks = new Map();
  nextId = 1;
  reduced.current = false;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Runs frames every `step` ms for `ms`; calls `each` after every frame. */
function run(ms: number, step: number, each: () => void = () => undefined) {
  const end = clock + ms;
  while (clock < end) {
    clock += step;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback();
    each();
  }
}

describe("RetargetableSpring", () => {
  it("jumps under reduced motion, with no loop", () => {
    reduced.current = true;
    const spring = new RetargetableSpring(0);
    spring.set(100);
    expect(spring.current).toBe(100);
    expect(callbacks.size).toBe(0);
  });

  it("jumps when instant", () => {
    const spring = new RetargetableSpring(0);
    spring.set(50, { instant: true });
    expect(spring.current).toBe(50);
    expect(spring.target).toBe(50);
    expect(callbacks.size).toBe(0);
  });

  it("keeps its value continuous when retargeted mid-flight", () => {
    const spring = new RetargetableSpring(0);
    spring.set(100);
    run(120, 16);
    const before = spring.current;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(100);
    spring.set(0);
    run(16, 16);
    // Moving on toward 100 from its velocity: not snapped back to 0 or on to 100.
    expect(Math.abs(spring.current - before)).toBeLessThan(15);
    const velocityKept = spring.current > before;
    expect(velocityKept).toBe(true);
  });

  it("stops itself and lands exactly on the target", () => {
    const spring = new RetargetableSpring(0, { precision: 0.25 });
    spring.set(100);
    run(3000, 16);
    expect(spring.current).toBe(100);
    expect(callbacks.size).toBe(0);
  });

  it("gives the same result at 60Hz and 144Hz", () => {
    const at = (step: number) => {
      callbacks.clear();
      clock = 1000;
      const spring = new RetargetableSpring(0);
      spring.set(100);
      const end = clock + 300;
      while (clock < end) {
        clock = Math.min(end, clock + step);
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) callback();
      }
      return spring.current;
    };
    expect(at(1000 / 60)).toBeCloseTo(at(1000 / 144), 6);
  });
});
