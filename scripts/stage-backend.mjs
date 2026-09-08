import { mkdir, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const binaryName =
	process.platform === 'win32' ? 'nice-audio-player-backend.exe' : 'nice-audio-player-backend';
const source = join('backend', 'target', 'release', binaryName);
const destinationDirectory = join('dist-backend', 'backend');
const destination = join(destinationDirectory, binaryName);

await rm(destinationDirectory, { recursive: true, force: true });
await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
