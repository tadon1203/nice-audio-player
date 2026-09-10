import { mkdir, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPaths, repositoryRoot } from './build-paths.mjs';

const binaryName =
	process.platform === 'win32' ? 'nice-audio-player-backend.exe' : 'nice-audio-player-backend';
const source = join(repositoryRoot, 'backend', 'target', 'release', binaryName);
const destinationDirectory = buildPaths.backend;
const destination = join(destinationDirectory, binaryName);

await rm(destinationDirectory, { recursive: true, force: true });
await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
