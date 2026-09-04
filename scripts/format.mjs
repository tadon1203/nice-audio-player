import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const targets = ['.'];

const mode = process.argv[2];
if (mode !== '--check' && mode !== '--write') {
	console.error('Usage: node scripts/format.mjs <--check|--write>');
	process.exit(2);
}

const prettierCli = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'node_modules',
	'prettier',
	'bin',
	'prettier.cjs'
);
const result = spawnSync(process.execPath, [prettierCli, mode, '--ignore-unknown', ...targets], {
	stdio: 'inherit'
});

if (result.error) {
	console.error(`format: ${result.error.message}`);
	process.exit(1);
}
process.exit(result.status ?? 1);
