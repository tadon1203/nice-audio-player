import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { electronOutput, rendererOutput, repositoryRoot, runtimeOutput } from './build-paths.mjs';

const runtimeDirectory = runtimeOutput;
const rootPackage = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true });

await cp(electronOutput, join(runtimeDirectory, 'electron'), { recursive: true });
await cp(rendererOutput, join(runtimeDirectory, 'renderer'), { recursive: true });
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
