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
            { name: "motion", message: "Motion is not part of the frontend runtime." },
            { name: "motion/react", message: "Motion is not part of the frontend runtime." },
            {
              name: "@base-ui/react",
              message: "Use repository-owned shadcn primitives from src/components/ui.",
            },
            {
              name: "@tauri-apps/plugin-log",
              message: "Use the project-owned diagnostics module.",
            },
          ],
          patterns: [
            {
              group: ["@base-ui/react/*"],
              message: "Use repository-owned shadcn primitives from src/components/ui.",
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
      ],
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/lib/diagnostics.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: [
      "src/hooks/use-context-overlay-semantics.ts",
      "src/hooks/use-reduced-motion-preference.ts",
      "src/test/setup.ts",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
);
