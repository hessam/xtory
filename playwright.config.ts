import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// Use the pre-installed Chromium when present (cloud sandbox); CI installs its own.
const sandboxChromium = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: 'http://localhost:4173', launchOptions, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
