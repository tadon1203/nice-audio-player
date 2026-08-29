import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/target/**", ".agents/skills/impeccable/**"],
  },

  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],

    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },

    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },

    rules: {
      ...reactHooks.configs.recommended.rules,

      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "motion/react",
              message: "Use an approved Motion owner module and update the frontend contract.",
            },
            {
              name: "@tauri-apps/plugin-log",
              message: "Use the project-owned diagnostics module.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='window'][property.name='matchMedia']",
          message: "Use the project-owned semantic viewport hook for matchMedia.",
        },
        {
          selector: "JSXAttribute[name.name='layout']",
          message: "Responsive layout projection is not an approved Motion primitive.",
        },
      ],
    },
  },
  {
    files: ["src/lib/diagnostics.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: [
      "src/main.tsx",
      "src/components/AppShell.tsx",
      "src/components/ApplicationActivityIndicator.tsx",
      "src/components/PlaybackDock.tsx",
      "src/components/RangeControl.tsx",
      "src/components/ui/Dialog.tsx",
      "src/components/ui/ExclusiveRegion.tsx",
      "src/features/library/AlbumArtworkIdentity.tsx",
      "src/features/library/AlbumArtistArtworkIdentity.tsx",
      "src/features/library/LibraryArtwork.tsx",
      "src/features/library/AlbumDetailView.tsx",
      "src/features/library/LibraryPresentationTabs.tsx",
      "src/features/library/LibraryView.tsx",
      "src/hooks/use-scroll-region.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tauri-apps/plugin-log",
              message: "Use the project-owned diagnostics module.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/hooks/use-context-overlay-semantics.ts", "src/test/setup.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
);
