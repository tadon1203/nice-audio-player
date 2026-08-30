import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps custom font-size and semantic color utilities together", () => {
    expect(cn("text-body-sm", "text-text-secondary")).toBe("text-body-sm text-text-secondary");
  });

  it("keeps only the last conflicting semantic font size", () => {
    expect(cn("text-body-sm", "text-body-md")).toBe("text-body-md");
  });

  it("preserves base text size when the responsive size differs", () => {
    expect(cn("text-body-sm", "app-wide:text-body-md")).toBe("text-body-sm app-wide:text-body-md");
  });
});
