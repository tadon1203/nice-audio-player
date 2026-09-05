import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile, globalIgnores } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import tailwind from 'eslint-plugin-tailwindcss';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	globalIgnores([
		'.agents/**',
		'.impeccable/**',
		'.svelte-kit/**',
		'src/lib/components/ui/**',
		'build/**',
		'dist-electron/**',
		'project_snapshot.zip'
	]),
	includeIgnoreFile(gitignorePath),
	{
		linterOptions: {
			reportUnusedDisableDirectives: 'error',
			reportUnusedInlineConfigs: 'error'
		}
	},
	js.configs.recommended,
	ts.configs.recommended,
	...ts.configs.recommendedTypeChecked.map((config) => ({
		...config,
		files: [
			'src/**/*.{ts,svelte,js}',
			'electron/**/*.ts',
			'tests/**/*.ts',
			'scripts/**/*.mjs',
			'*.config.ts'
		],
		languageOptions: {
			...config.languageOptions,
			parserOptions: { ...config.languageOptions?.parserOptions, projectService: true }
		}
	})),
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		plugins: { tailwindcss: tailwind },
		settings: { tailwindcss: { cssConfigPath: './src/routes/layout.css' } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['src/**/*.{ts,svelte}'],
		languageOptions: { parserOptions: { projectService: true } },
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'electron',
							message: 'Renderer code must use $lib/api instead of Electron directly.'
						},
						{ name: 'gsap', message: 'Application code must use $lib/animation.' }
					],
					patterns: [
						{
							group: ['node:*', '**/electron/**'],
							message: 'Renderer code must not depend on Node or Electron implementation code.'
						},
						{ group: ['gsap/*'], message: 'Application code must use $lib/animation.' }
					]
				}
			],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/switch-exhaustiveness-check': 'error',
			'@typescript-eslint/ban-ts-comment': [
				'error',
				{ 'ts-check': false, 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true }
			],
			'svelte/valid-compile': 'error',
			'svelte/no-dom-manipulating': 'error',
			'svelte/prefer-svelte-reactivity': 'error',
			'svelte/no-unused-props': ['error', { checkImportedTypes: true }],
			'tailwindcss/classnames-order': 'off',
			'tailwindcss/no-contradicting-classname': 'error',
			'tailwindcss/no-custom-classname': [
				'error',
				{
					whitelist: [
						'inset-block-end-3',
						'bg-surface-muted',
						'rounded-panel',
						'shadow-panel',
						'classValues'
					]
				}
			],
			'tailwindcss/no-unnecessary-arbitrary-value': 'error'
		}
	},
	// Svelte props are intentionally mutable because the compiler updates them.
	// TypeScript and JavaScript retain prefer-const.
	{
		files: ['**/*.svelte'],
		rules: { 'prefer-const': 'off' }
	},
	// Electron is the host boundary and may use Node/Electron APIs directly.
	{
		files: ['electron/**/*.ts'],
		languageOptions: { globals: globals.node },
		rules: { 'no-restricted-imports': 'off' }
	},
	// Tests and build scripts are Node-side typed projects, not renderer code.
	{
		files: ['tests/**/*.ts', 'scripts/**/*.mjs'],
		languageOptions: { globals: globals.node }
	},
	{
		files: ['src/lib/animation/**/*.{ts,svelte}'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [{ name: 'electron', message: '$lib/animation must remain renderer-only.' }],
					patterns: [
						{
							group: ['node:*', '**/electron/**'],
							message: '$lib/animation must remain renderer-only.'
						}
					]
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	}
);
