import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm run test:renderer',
		port: 4200
	},
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		browserName: 'chromium'
	}
});
