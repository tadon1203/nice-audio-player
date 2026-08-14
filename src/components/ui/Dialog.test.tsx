/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

function mountRoots() {
  document.body.innerHTML = '<div id="root"></div><div id="overlay-root"></div>';
}

function FocusDialog({ onClose }: { onClose: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog title="Confirm" initialFocusRef={cancelRef} onClose={onClose}>
      <button ref={cancelRef}>Cancel</button>
      <button>Remove</button>
    </Dialog>
  );
}

describe("Dialog", () => {
  afterEach(() => {
    cleanup();
    mountRoots();
  });

  it("portals an alertdialog, labels it, and makes the app inert", () => {
    mountRoots();
    render(
      <Dialog title="Remove folder" role="alertdialog" onClose={vi.fn()}>
        <button>Cancel</button>
      </Dialog>,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Remove folder" });
    expect(document.getElementById("overlay-root")).toContainElement(dialog);
    expect(document.getElementById("root")).not.toContainElement(dialog);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(document.getElementById("root")).toHaveAttribute("inert");
  });

  it("captures the invoker, traps focus, handles Escape, and restores focus", async () => {
    mountRoots();
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.getElementById("root")!.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const view = render(<FocusDialog onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    const remove = screen.getByRole("button", { name: "Remove" });
    remove.focus();
    fireEvent.keyDown(remove, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    await awaitFocus(trigger);
  });

  it("uses fallback focus when the invoker disappears", async () => {
    mountRoots();
    const trigger = document.createElement("button");
    const fallback = document.createElement("button");
    document.getElementById("root")!.append(trigger, fallback);
    trigger.focus();
    const view = render(
      <Dialog title="Confirm" fallbackFocusRef={{ current: fallback }} onClose={vi.fn()}>
        <button>Cancel</button>
      </Dialog>,
    );
    trigger.remove();
    view.unmount();
    await awaitFocus(fallback);
  });
});

async function awaitFocus(element: HTMLElement) {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 10));
  expect(element).toHaveFocus();
}
