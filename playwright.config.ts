import { defineConfig } from '@playwright/test';

const baseURL = 'http://localhost:4175';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL, browserName: 'chromium', headless: true },
  webServer: {
    command: 'npm exec vite -- preview --host localhost --port 4175 --strictPort',
    url: baseURL,
  },
});
