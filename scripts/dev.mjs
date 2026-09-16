import chokidar from 'chokidar';
import { execa } from 'execa';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildNative, nativeWatchPaths } from './build-native.mjs';
import { createElectronBuildContext } from './build-electron.mjs';

const require = createRequire(import.meta.url);
/** @type {(options: { resources: string[] }) => Promise<unknown>} */
const waitOn = require('wait-on');

/** @typedef {import('execa').Subprocess} Subprocess */
/** @typedef {import('chokidar').FSWatcher} FSWatcher */
/** @typedef {import('esbuild').BuildContext} BuildContext */

const rendererUrl = 'http://127.0.0.1:4200';

let shuttingDown = false;
let runtimeStarted = false;
let nativeReady = true;
/** @type {Subprocess | undefined} */
let electronProcess;
/** @type {Subprocess | undefined} */
let rendererProcess;
/** @type {FSWatcher | undefined} */
let nativeWatcher;
/** @type {BuildContext | undefined} */
let electronContext;
/** @type {'electron' | 'native' | undefined} */
let pendingRestart;
/** @type {Promise<void> | undefined} */
let restartLoop;
/** @type {AbortController | undefined} */
let nativeBuildController;
/** @type {Promise<unknown> | undefined} */
let nativeBuildPromise;

const plannedStops = new WeakSet();

/** @param {'electron' | 'native'} kind */
function requestRestart(kind) {
	if (shuttingDown) return;
	if (pendingRestart !== 'native' || kind === 'native') pendingRestart = kind;
	if (!restartLoop) {
		restartLoop = processRestartQueue().finally(() => {
			restartLoop = undefined;
			if (pendingRestart && !shuttingDown) requestRestart(pendingRestart);
		});
	}
}

async function processRestartQueue() {
	while (pendingRestart && !shuttingDown) {
		const kind = pendingRestart;
		pendingRestart = undefined;
		if (kind === 'native') await restartNative();
		else await restartElectron();
	}
}

async function restartElectron() {
	await stopElectron();
	if (nativeReady && runtimeStarted) await startElectron();
}

async function restartNative() {
	nativeReady = false;
	await stopElectron();
	try {
		await buildNativeForSession();
		nativeReady = true;
		if (runtimeStarted) await startElectron();
	} catch (error) {
		if (!shuttingDown) {
			console.error('[dev] native build failed; waiting for the next native change');
			console.error(error);
		}
	}
}

async function buildNativeForSession() {
	const controller = new AbortController();
	nativeBuildController = controller;
	const promise = buildNative({ cancelSignal: controller.signal });
	nativeBuildPromise = promise;
	try {
		return await promise;
	} finally {
		if (nativeBuildController === controller) nativeBuildController = undefined;
		if (nativeBuildPromise === promise) nativeBuildPromise = undefined;
	}
}

function startAngular() {
	const child = execa('ng', ['serve', '--host', '127.0.0.1', '--port', '4200'], {
		preferLocal: true,
		stdio: 'inherit',
		reject: false,
		killDescendants: true
	});
	rendererProcess = child;
	void child.then((result) => {
		if (rendererProcess === child) rendererProcess = undefined;
		if (!shuttingDown && !plannedStops.has(child)) void shutdown(result.exitCode ?? 1);
	});
	return child;
}

async function startElectron() {
	if (shuttingDown || !nativeReady || electronProcess) return;
	const child = execa('electron', ['.'], {
		preferLocal: true,
		stdio: 'inherit',
		reject: false,
		killDescendants: true,
		env: { ...process.env, NICE_AUDIO_PLAYER_DEV_SERVER_URL: rendererUrl }
	});
	electronProcess = child;
	void child.then((result) => {
		if (electronProcess === child) electronProcess = undefined;
		if (!shuttingDown && !plannedStops.has(child)) void shutdown(result.exitCode ?? 1);
	});
}

async function stopElectron() {
	const child = electronProcess;
	if (!child) return;
	plannedStops.add(child);
	child.kill('SIGTERM');
	await child;
	if (electronProcess === child) electronProcess = undefined;
}

async function stopRenderer() {
	const child = rendererProcess;
	if (!child) return;
	plannedStops.add(child);
	child.kill('SIGTERM');
	await child;
	if (rendererProcess === child) rendererProcess = undefined;
}

/** @param {Subprocess} child */
async function waitForRendererReady(child) {
	const rendererReady = waitOn({ resources: [rendererUrl] });
	const rendererExit = child.then((result) => {
		throw new Error(
			`[dev] renderer exited before becoming ready (exit code ${result.exitCode ?? 'unknown'})`
		);
	});
	await Promise.race([rendererReady, rendererExit]);
}

async function shutdown(exitCode = 0) {
	if (shuttingDown) return;
	shuttingDown = true;
	pendingRestart = undefined;
	if (nativeBuildController) nativeBuildController.abort();

	try {
		if (nativeWatcher) await nativeWatcher.close();
	} catch (error) {
		console.error('[dev] native watcher cleanup failed', error);
	}

	try {
		await stopElectron();
	} catch (error) {
		console.error('[dev] Electron cleanup failed', error);
	}

	try {
		if (electronContext) await electronContext.dispose();
	} catch (error) {
		console.error('[dev] Electron build context cleanup failed', error);
	}

	try {
		await stopRenderer();
	} catch (error) {
		console.error('[dev] renderer cleanup failed', error);
	}

	try {
		if (nativeBuildPromise) await nativeBuildPromise;
	} catch {
		// Cancellation is expected when shutdown interrupts a native build.
	}

	process.exitCode = exitCode;
}

async function run() {
	const renderer = startAngular();
	electronContext = await createElectronBuildContext(() => {
		if (runtimeStarted) requestRestart('electron');
	});
	await electronContext.rebuild();
	await buildNativeForSession();
	await waitForRendererReady(renderer);
	if (shuttingDown) throw new Error('[dev] session ended during startup');
	await electronContext.watch();
	if (shuttingDown) throw new Error('[dev] session ended during startup');
	nativeWatcher = chokidar.watch(nativeWatchPaths, {
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 }
	});
	if (shuttingDown) {
		await nativeWatcher.close();
		nativeWatcher = undefined;
		throw new Error('[dev] session ended during startup');
	}
	nativeWatcher.on('all', () => requestRestart('native'));
	await startElectron();
	if (shuttingDown) throw new Error('[dev] session ended during startup');
	runtimeStarted = true;
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
	run().catch((error) => {
		console.error('[dev] startup failed');
		console.error(error);
		void shutdown(1);
	});
}
