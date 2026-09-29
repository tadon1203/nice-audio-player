// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { motionTokens } from "./tokens";

// CSS owns hover/press/overlay timing (`--duration-*`), JS owns springs. The one value both
// sides use is the feedback duration, so it must be the same number in both places.
const css = readFileSync(new URL("../../../../app/renderer/styles.css", import.meta.url), "utf8");

describe("motion tokens and styles.css", () => {
  it("agree on the feedback duration", () => {
    const declared = /--duration-feedback:\s*(\d+)ms/.exec(css);
    expect(declared).not.toBeNull();
    expect(Number(declared![1]) / 1000).toBe(motionTokens.feedback.duration);
  });

  it("uses that duration for reduced motion instead of a separate value", () => {
    const reduced = /prefers-reduced-motion: reduce\)\s*\{[^}]*\{[^}]*\}/.exec(css);
    expect(reduced?.[0]).toContain("transition-duration: var(--duration-feedback)");
  });
});
