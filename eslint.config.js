import svelte from "eslint-plugin-svelte";
import tsParser from "@typescript-eslint/parser";

// Oxlint owns general rules; ESLint covers Svelte markup and presentation boundaries.
export default [
  { ignores: ["**/skills/**"] },
  ...svelte.configs["flat/base"],
  {
    files: ["src/**/*.{ts,svelte}"],
    languageOptions: { parserOptions: { parser: tsParser } },
    linterOptions: { reportUnusedDisableDirectives: false, noInlineConfig: true },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "bits-ui", message: "Use the shared UI adapters." }],
          patterns: [
            {
              group: [
                "**/legacy-button*",
                "**/*-portal.svelte",
                "**/*-overlay.svelte",
                "**/button/button.svelte",
                "**/control-styles*",
                "**/time-state*",
                "**/floating-layer*",
              ],
              message: "Presentation implementation stays inside its owner.",
            },
          ],
        },
      ],
      "svelte/no-restricted-html-elements": ["error", "button", "input", "select", "textarea"],
    },
  },
  {
    files: [
      "src/lib/ui/shadcn/**/*.{ts,svelte}",
      "src/lib/ui/{context-menu,dropdown-menu}/**/*.{ts,svelte}",
      "src/lib/ui/time-presentation.svelte",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tsParser },
    rules: { "svelte/no-restricted-html-elements": "off" },
  },
  {
    files: ["src/lib/ui/shadcn/{button,input,textarea}/**/*.svelte"],
    rules: { "svelte/no-restricted-html-elements": "off" },
  },
];
