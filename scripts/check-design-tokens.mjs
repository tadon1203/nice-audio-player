import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const rendererRoot = join(root, 'src', 'app');
const stylesRoot = join(root, 'src', 'styles');
const tokenRoot = join(stylesRoot, 'tokens');
const testRoot = join(root, 'tests');
const referencePath = join(tokenRoot, 'reference.css');

const requiredPublicPrefixes = [
	'--nap-color-',
	'--nap-type-',
	'--nap-space-',
	'--nap-radius-',
	'--nap-size-',
	'--nap-stroke-',
	'--nap-focus-',
	'--nap-motion-',
	'--nap-shadow-',
	'--nap-layer-',
	'--nap-layout-'
];

/** @param {string} directory @returns {string[]} */
function filesUnder(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return filesUnder(path);
		return /\.(?:html|ts|css)$/.test(entry.name) ? [path] : [];
	});
}

const tokenFiles = filesUnder(tokenRoot);
const styleFiles = filesUnder(stylesRoot);
const sourceFiles = [
	...filesUnder(rendererRoot),
	...filesUnder(testRoot),
	...styleFiles.filter((path) => !tokenFiles.includes(path))
];
const tokenContents = tokenFiles.map((path) => readFileSync(path, 'utf8')).join('\n');
const errors = [];

for (const prefix of requiredPublicPrefixes) {
	if (!tokenContents.includes(prefix))
		errors.push(`token files are missing required public token prefix ${prefix}`);
}

const rawTokenPattern = /--nap-ref-[a-z0-9-]+\s*:/;
const rawReferenceUsePattern = /var\(--nap-ref-[a-z0-9-]+\)/;
for (const path of styleFiles) {
	const contents = readFileSync(path, 'utf8');
	const isReferenceFile = path === referencePath;
	if (!isReferenceFile && rawTokenPattern.test(contents))
		errors.push(`${relative(root, path)} defines a raw reference token outside reference.css`);
	if (!isReferenceFile && !tokenFiles.includes(path) && rawReferenceUsePattern.test(contents))
		errors.push(`${relative(root, path)} references a raw token directly`);
}

const privateDefinitionPattern =
	/(?:^|[{\s;])(--(?!nap-|color-|font-|text-|spacing-|radius-|shadow-|transition-|ease-|z-|breakpoint-|max-width-)[a-z][a-z0-9-]*)\s*:/g;
const privateAliasPattern = /--(?!nap-)[a-z][a-z0-9-]*\s*:\s*var\(--nap-[a-z0-9-]+\)\s*;/g;
const privateDefinitions = new Map();

for (const path of styleFiles) {
	const contents = readFileSync(path, 'utf8');
	for (const match of contents.matchAll(privateDefinitionPattern)) {
		const name = match[1];
		const isPrivateFile = path.endsWith('.tokens.css');
		if (!isPrivateFile)
			errors.push(
				`${relative(root, path)} defines private token ${name} outside a *.tokens.css file`
			);
		else privateDefinitions.set(name, path);
	}
	if (path.endsWith('.tokens.css') && privateAliasPattern.test(contents))
		errors.push(
			`${relative(root, path)} contains a private token that only aliases a public semantic token`
		);
}

for (const [name, owner] of privateDefinitions) {
	for (const path of [...sourceFiles, ...styleFiles].filter((candidate) => candidate !== owner)) {
		if (readFileSync(path, 'utf8').includes(`var(${name})`))
			errors.push(
				`${relative(root, path)} uses private token ${name} owned by ${relative(root, owner)}`
			);
	}
}

const forbiddenSourcePatterns = [
	/--md-|md-sys|md-ref/,
	/(?:^|[\s"'`])(?:bg|text)-(?:zinc|neutral|white|black)(?:\/[^\s"'`]+)?(?=[\s"'`])/,
	/(?:^|[\s"'`])rounded-(?:sm|md|lg|xl)(?=[\s"'`])/,
	/(?:^|[\s"'`])(?:gap|space|p|px|py|m|mt|mb|mx|my|size|duration|ease)-\[[^\]]+\](?=[\s"'`])/,
	/(?:^|[\s"'`])(?:h|w)-\[[^\]]*(?:px|rem)\](?=[\s"'`])/,
	/(?:^|[\s"'`])(?:gap|space|p|px|py|m|mt|mb|mx|my)-[1-9][0-9]*(?:\/[^\s"'`]+)?(?=[\s"'`])/
];

for (const path of sourceFiles) {
	const contents = readFileSync(path, 'utf8');
	for (const pattern of forbiddenSourcePatterns) {
		if (pattern.test(contents)) {
			errors.push(`${relative(root, path)} contains a forbidden design token or utility`);
			break;
		}
	}
}

if (errors.length > 0) {
	console.error([...new Set(errors)].join('\n'));
	process.exitCode = 1;
}
