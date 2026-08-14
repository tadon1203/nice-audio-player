/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentTransition } from "./ContentTransition";

describe("ContentTransition", () => {
  it("renders the initial content in a dedicated overlap stage", () => {
    render(
      <ContentTransition contentKey="library">
        <h1>Library</h1>
      </ContentTransition>,
    );
    expect(screen.getByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(document.querySelector(".content-transition-stage")).toBeInTheDocument();
    expect(document.querySelector(".content-transition")).toHaveAttribute("data-motion");
  });

  it("accepts a destination key change without changing child semantics", () => {
    const { rerender } = render(
      <ContentTransition contentKey="library">
        <h1>Library</h1>
      </ContentTransition>,
    );
    rerender(
      <ContentTransition contentKey="settings">
        <h1>Settings</h1>
      </ContentTransition>,
    );
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });
});
