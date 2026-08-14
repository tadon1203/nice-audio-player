/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineNotice } from "./InlineNotice";

describe("InlineNotice", () => {
  it("keeps neutral notices non-alert and preserves nested actions", () => {
    render(
      <InlineNotice>
        Ready <button type="button">Retry</button>
      </InlineNotice>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("exposes error notices as alerts", () => {
    render(<InlineNotice tone="error">Something failed</InlineNotice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something failed");
  });
});
