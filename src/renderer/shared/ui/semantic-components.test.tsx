import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/renderer/shared/ui/button";

describe("semantic UI interaction", () => {
  it("activates a named button through user input", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const view = render(<Button onClick={onClick}>Add folder</Button>);
    await user.click(view.getByRole("button", { name: "Add folder" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
