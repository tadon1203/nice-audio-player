import { cva } from "class-variance-authority";

export const typographyVariants = cva("font-interface", {
  variants: {
    role: {
      "application-heading": "text-application-heading font-semibold leading-application-heading",
      "media-title":
        "font-character text-media-artist font-regular leading-media-artist tracking-normal app-wide:text-media-title app-wide:leading-media-title app-wide:tracking-character-snug",
      "media-title-interface":
        "text-media-artist font-semibold leading-media-artist tracking-normal app-wide:text-media-title-interface app-wide:leading-media-title-interface",
      "media-artist": "text-media-artist font-regular leading-media-artist",
      "section-title": "text-section-title font-semibold leading-section-title",
      "body-lg": "text-body-lg font-regular leading-body-lg",
      "body-md": "text-body-md font-regular leading-body-md",
      "body-sm": "text-body-sm font-regular leading-body-sm",
      label: "text-caption font-medium leading-caption tracking-label",
      numeric: "text-caption font-medium leading-caption tabular-nums",
    },
  },
  defaultVariants: { role: "body-md" },
});
