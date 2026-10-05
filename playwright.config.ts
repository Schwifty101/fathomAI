import { defineConfig } from '@playwright/test'

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL },
  // Against a deployed URL (BASE_URL set) nothing to start; locally build and serve the production app.
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run build && npm start', url: baseURL, reuseExistingServer: true, timeout: 240_000 },
})
