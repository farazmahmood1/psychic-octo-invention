import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const env: Record<string, string> = {};
  const content = fs.readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value;
  }

  return env;
}

const dotEnv = loadDotEnv(path.resolve(process.cwd(), '.env'));
const webServerEnv = { ...dotEnv, ...process.env };

// Make .env values available to Playwright test workers too.
for (const [key, value] of Object.entries(dotEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      port: 4000,
      timeout: 30_000,
      reuseExistingServer: false,
      env: webServerEnv,
    },
    {
      command: 'npm run dev:admin',
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: false,
      env: webServerEnv,
    },
  ],
});
