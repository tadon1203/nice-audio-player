/** @type {import('stylelint').Config} */
export default {
	ignoreFiles: ['src/lib/components/ui/**/*.svelte'],
	extends: ['stylelint-config-standard'],
	referenceFiles: ['src/lib/styles/theme.css', 'src/routes/layout.css'],
	rules: {
		'no-unknown-custom-properties': true,
		'import-notation': 'string',
		'at-rule-no-unknown': [
			true,
			{ ignoreAtRules: ['theme', 'custom-variant', 'utility', 'source'] }
		],
		'declaration-no-important': true,
		'selector-max-id': 0,
		'color-no-hex': true,
		'function-disallowed-list': [
			'rgb',
			'rgba',
			'hsl',
			'hsla',
			'hwb',
			'lab',
			'lch',
			'oklab',
			'oklch',
			'color',
			'color-mix'
		],
		// Project tokens, Tailwind v4 derived text variables, and its namespace reset.
		'custom-property-pattern': '^(?:[a-z][a-z0-9-]*(?:--[a-z0-9-]+)*|\\*)$'
	},
	overrides: [
		{ files: ['**/*.svelte'], customSyntax: 'postcss-html' },
		{
			files: ['src/lib/styles/theme.css'],
			rules: {
				'color-no-hex': null,
				'color-hex-length': null,
				'function-disallowed-list': null
			}
		}
	]
};
