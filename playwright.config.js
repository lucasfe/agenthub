import { defineConfig } from '@playwright/test'

const isPreview = !!process.env.PLAYWRIGHT_BASE_URL
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // Bypass Vercel deployment protection on preview deploys
    ...(isPreview && process.env.BYPASS_SECRET && {
      extraHTTPHeaders: {
        'x-vercel-protection-bypass': process.env.BYPASS_SECRET,
      },
    }),
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  // Only start local dev server when not testing against a preview URL
  ...(!isPreview && {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:5173/',
      timeout: 10000,
      reuseExistingServer: !process.env.CI,
    },
  }),
})
