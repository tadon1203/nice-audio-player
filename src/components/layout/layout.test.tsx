/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResponsiveCluster } from "./ResponsiveCluster";

describe("layout primitives", () => {
  afterEach(cleanup);

  it("maps cluster alignment and preserves child order", () => {
    const { container } = render(
      <ResponsiveCluster align="end">
        <span>First</span>
        <span>Second</span>
      </ResponsiveCluster>,
    );

    const cluster = container.firstElementChild;
    expect(cluster).toHaveAttribute("data-layout", "cluster");
    expect(cluster).toHaveAttribute("data-align", "end");
    expect(cluster).toHaveAttribute("data-wraps", "true");
    expect(cluster).toHaveTextContent("FirstSecond");
  });
});
