import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  use: { baseURL: 'http://127.0.0.1:8417', viewport: { width: 1440, height: 950 }, screenshot: 'only-on-failure' },
  webServer: { command: 'npx vite playground --host 127.0.0.1 --port 8417 --strictPort', url: 'http://127.0.0.1:8417', reuseExistingServer: false },
});
