import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const tokenRoot = join(root, 'src', 'styles', 'tokens');
const requiredTokenFiles = [
	'color.css',
	'typography.css',
	'spacing.css',
	'shape.css',
	'size.css',
	'motion.css',
	'elevation.css',
	'layout.css',
	'index.css'
];
const ignoredDirectories = new Set(['.git', 'node_modules', 'build', 'target', '.angular']);
const textExtensions = new Set([
	'.css',
	'.html',
	'.ts',
	'.js',
	'.mjs',
	'.json',
	'.md',
	'.yml',
	'.yaml'
]);
const errors = [];

for (const file of requiredTokenFiles) {
	if (!existsSync(join(tokenRoot, file)))
		errors.push(`missing required token file: src/styles/tokens/${file}`);
}

/** @param {string} directory @returns {string[]} */
function filesUnder(directory) {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if (entry.isDirectory()) {
			if (ignoredDirectories.has(entry.name)) return [];
			return filesUnder(join(directory, entry.name));
		}
		return textExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))
			? [join(directory, entry.name)]
			: [];
	});
}

for (const path of filesUnder(root)) {
	const relativePath = relative(root, path).replaceAll('\\', '/');
	const contents = readFileSync(path, 'utf8');

	if (relativePath.endsWith('/reference.css') || relativePath.endsWith('/layer.css')) {
		errors.push(`${relativePath} must not exist`);
	}
	if (relativePath.endsWith('.tokens.css')) errors.push(`${relativePath} must not exist`);
	if (/--nap-ref-[a-z0-9-]+/.test(contents))
		errors.push(`${relativePath} contains a forbidden --nap-ref-* token`);
	if (
		(relativePath.endsWith('.html') || relativePath.endsWith('.ts')) &&
		/var\(--nap-[^)]+\)/.test(contents)
	) {
		errors.push(`${relativePath} references product tokens directly with var(--nap-*)`);
	}
}

if (errors.length > 0) {
	console.error([...new Set(errors)].join('\n'));
	process.exitCode = 1;
}
