import { defineConfig } from '@playwright/test';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const baseURL = 'http://127.0.0.1:4200';

export default defineConfig({
	webServer: {
		command: `${pnpmCommand} run test:renderer`,
		port: 4200,
		timeout: 120_000,
		reuseExistingServer: true
	},
	testDir: './tests',
	outputDir: 'test-results/playwright',
	snapshotPathTemplate:
		'{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}',
	projects: [
		{
			name: 'renderer',
			testMatch: '**/*.e2e.{ts,js}',
			testIgnore: '**/electron/**/*.e2e.{ts,js}',
			use: {
				baseURL,
				browserName: 'chromium',
				trace: 'retain-on-failure',
				screenshot: 'only-on-failure'
			}
		},
		{
			name: 'electron',
			testMatch: '**/electron/**/*.e2e.{ts,js}',
			workers: 1,
			use: {
				baseURL,
				trace: 'retain-on-failure',
				screenshot: 'only-on-failure'
			}
		}
	]
});
