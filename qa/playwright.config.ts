import { defineConfig } from '@playwright/test';

const baseURL = process.env.QA_BASE_URL || 'https://digivated.com';
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

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
    extraHTTPHeaders: bypass ? { 'x-vercel-protection-bypass': bypass } : {},
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
});
