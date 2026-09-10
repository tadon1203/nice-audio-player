import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const runtimeDirectory = join('build', 'runtime');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true });

await cp('build/electron', join(runtimeDirectory, 'electron'), { recursive: true });
await cp('build/renderer', join(runtimeDirectory, 'renderer'), { recursive: true });
await writeFile(
	join(runtimeDirectory, 'package.json'),
	JSON.stringify(
		{
			name: rootPackage.name,
			version: rootPackage.version,
			productName: rootPackage.productName ?? 'Nice Audio Player',
			main: 'electron/main.cjs',
			type: rootPackage.type
		},
		null,
		2
	) + '\n'
);
