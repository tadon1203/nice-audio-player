import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm exec ng serve --host 127.0.0.1 --port 4200',
		port: 4200
	},
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		browserName: 'chromium'
	}
});
