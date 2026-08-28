import { describe, expect, it, vi } from "vitest";
import { diagnostics } from "./diagnostics";
import { createProductionRootDiagnostics, createRootOptions } from "./react-root-diagnostics";

vi.mock("./diagnostics", () => ({
  diagnostics: { error: vi.fn(), warn: vi.fn() },
}));

describe("React root diagnostics", () => {
  it("omits custom handlers outside production", () => {
    expect(createRootOptions("development")).toBeUndefined();
    expect(createRootOptions("test")).toBeUndefined();
  });

  it("maps the production callbacks to semantic events", () => {
    const options = createProductionRootDiagnostics();
    const info = { componentStack: " in Player" };
    options.onUncaughtError(new Error("uncaught"), info);
    options.onCaughtError(new Error("caught"), info);
    options.onRecoverableError(new Error("recoverable"), info);
    expect(diagnostics.error).toHaveBeenNthCalledWith(
      1,
      "frontend.react.uncaught_error",
      expect.any(Object),
    );
    expect(diagnostics.error).toHaveBeenNthCalledWith(
      2,
      "frontend.react.caught_error",
      expect.any(Object),
    );
    expect(diagnostics.warn).toHaveBeenCalledWith(
      "frontend.react.recoverable_error",
      expect.any(Object),
    );
  });
});
