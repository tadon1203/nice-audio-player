import { resolve } from 'node:path';

export const repositoryRoot = resolve(import.meta.dirname, '..');
export const buildRoot = resolve(repositoryRoot, 'build');

export const electronOutput = resolve(buildRoot, 'electron');
export const rendererOutput = resolve(buildRoot, 'renderer');
export const backendOutput = resolve(buildRoot, 'backend');
export const runtimeOutput = resolve(buildRoot, 'runtime');
export const forgeOutput = resolve(buildRoot, 'forge');
