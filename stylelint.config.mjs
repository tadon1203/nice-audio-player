/** @type {import('stylelint').Config} */
export default {
	extends: ['stylelint-config-standard'],
	referenceFiles: ['src/styles/theme.css', 'src/styles.css'],
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
		'property-disallowed-list': [
			'animation',
			'animation-delay',
			'animation-direction',
			'animation-duration',
			'animation-fill-mode',
			'animation-iteration-count',
			'animation-name',
			'animation-play-state',
			'animation-timing-function',
			'transition',
			'transition-behavior',
			'transition-delay',
			'transition-duration',
			'transition-property',
			'transition-timing-function'
		],
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
		{
			files: ['src/styles/theme.css'],
			rules: {
				'color-no-hex': null,
				'color-hex-length': null,
				'function-disallowed-list': null
			}
		}
	]
};
