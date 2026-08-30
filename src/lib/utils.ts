import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "canvas",
        "surface",
        "surface-raised",
        "surface-hover",
        "surface-pressed",
        "border-subtle",
        "border-control",
        "text-primary",
        "text-secondary",
        "text-muted",
        "text-disabled",
        "focus-ring",
        "action-filled",
        "action-filled-hover",
        "action-filled-pressed",
        "action-filled-foreground",
        "error",
        "error-surface",
      ],
      font: ["interface", "character"],
      text: [
        "application-heading",
        "media-title",
        "media-title-interface",
        "media-artist",
        "section-title",
        "body-lg",
        "body-md",
        "body-sm",
        "caption",
      ],
      "font-weight": ["regular", "medium", "semibold"],
      leading: [
        "application-heading",
        "media-title",
        "media-title-interface",
        "media-artist",
        "section-title",
        "body-lg",
        "body-md",
        "body-sm",
        "caption",
      ],
      tracking: ["character-tight", "character-snug", "label"],
      radius: ["none", "control", "surface", "media", "full"],
      ease: ["interface"],
      breakpoint: ["app-wide", "context-split"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
