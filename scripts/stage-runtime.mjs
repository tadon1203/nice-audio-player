import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const runtimeDirectory = 'dist-package';
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true });

await cp('dist-electron', join(runtimeDirectory, 'dist-electron'), { recursive: true });
await cp('dist-renderer', join(runtimeDirectory, 'dist-renderer'), { recursive: true });
await writeFile(
	join(runtimeDirectory, 'package.json'),
	JSON.stringify(
		{
			name: rootPackage.name,
			version: rootPackage.version,
			productName: rootPackage.productName ?? 'Nice Audio Player',
			main: rootPackage.main,
			type: rootPackage.type
		},
		null,
		2
	) + '\n'
);
