import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm build:renderer && pnpm preview',
		port: 4173
	},
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		browserName: 'chromium'
	}
});
