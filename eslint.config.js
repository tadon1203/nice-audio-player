import prettier from 'eslint-config-prettier';
import angular from 'angular-eslint';
import path from 'node:path';
import js from '@eslint/js';
import { defineConfig, includeIgnoreFile, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tailwindcss from 'eslint-plugin-tailwindcss';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	globalIgnores([
		'.agents/**',
		'.impeccable/**',
		'.angular/**',
		'build/**',
		'dist-electron/**',
		'dist-renderer/**',
		'backend/target/**',
		'project_snapshot.zip'
	]),
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	...ts.configs.recommendedTypeChecked.map((config) => ({
		...config,
		files: ['src/**/*.ts', 'shared/**/*.ts', 'electron/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
		languageOptions: {
			...config.languageOptions,
			parserOptions: { ...config.languageOptions?.parserOptions, projectService: true }
		}
	})),
	prettier,
	{
		files: ['src/**/*.ts'],
		languageOptions: { globals: globals.browser },
		rules: { 'no-undef': 'off' }
	},
	{
		files: ['electron/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
		languageOptions: { globals: globals.node },
		rules: { 'no-undef': 'off' }
	},
	{
		files: ['scripts/**/*.mjs'],
		languageOptions: { globals: globals.node },
		rules: { 'no-undef': 'off' }
	},
	{
		files: ['src/**/*.ts'],
		extends: [...angular.configs.tsRecommended],
		processor: angular.processInlineTemplates
	},
	{
		files: ['src/**/*.html'],
		extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility]
	},
	{
		files: ['shared/**/*.ts', 'tests/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['../../**'],
							message: 'Use a configured path alias instead of a deep relative import.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/**/*.ts', 'shared/**/*.ts', 'electron/**/*.ts', 'tests/**/*.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/switch-exhaustiveness-check': 'error',
			'@typescript-eslint/ban-ts-comment': [
				'error',
				{ 'ts-check': false, 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true }
			]
		}
	},
	{
		files: ['src/app/core/motion/internal/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{ name: 'electron', message: 'Renderer code must use the shared host contract.' },
						{ name: '@angular/animations', message: 'Use the core motion boundary.' }
					],
					patterns: [
						{
							group: ['../../**'],
							message: 'Use a configured path alias instead of a deep relative import.'
						},
						{
							group: ['node:*', '**/electron/**'],
							message: 'Renderer code must not depend on Node or Electron.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/**/*.ts'],
		ignores: ['src/app/core/motion/internal/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{ name: 'electron', message: 'Renderer code must use the shared host contract.' },
						{ name: '@angular/animations', message: 'Use the core motion boundary.' }
					],
					patterns: [
						{
							group: ['../../**'],
							message: 'Use a configured path alias instead of a deep relative import.'
						},
						{
							group: ['node:*', '**/electron/**'],
							message: 'Renderer code must not depend on Node or Electron.'
						},
						{
							group: ['gsap', 'gsap/*'],
							message: 'Use src/app/core/motion instead of importing GSAP directly.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/**/*.html'],
		plugins: { tailwindcss },
		settings: {
			tailwindcss: {
				attributes: ['class'],
				cssConfigPath: './src/styles.css'
			}
		},
		rules: {
			'tailwindcss/no-contradicting-classname': 'error',
			'tailwindcss/no-unnecessary-arbitrary-value': 'error'
		}
	}
);
