import { defineConfig } from '@playwright/test';

const baseURL = process.env.QA_BASE_URL || 'https://digivated.com';

export default defineConfig({
  testDir: '.',
  testMatch: 'monitor.spec.ts',
  timeout: 25000,
  retries: 1,
  workers: 2,
  outputDir: '../test-results/qa',
  reporter: [['list'], ['json', { outputFile: '../test-results/qa-report.json' }]],
  use: {
    baseURL,
    headless: true,
    reducedMotion: 'reduce',
    userAgent: 'Digivated-monitor-bot',
    ...(process.env.QA_STORAGE_STATE ? { storageState: process.env.QA_STORAGE_STATE } : {}),
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
});
