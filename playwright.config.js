import { defineConfig, devices } from '@playwright/test'

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
      // Desktop suite owns the top-level e2e/*.spec.js files; mobile specs
      // live under e2e/mobile/ and must run only in the iPhone-sized project.
      testIgnore: '**/mobile/**',
    },
    {
      name: 'mobile',
      // iPhone 13 device descriptor: 390x844 viewport, mobile Safari UA,
      // isMobile + hasTouch. We override browserName to chromium because CI
      // installs only the chromium browser; the viewport + UA + touch are what
      // actually gate the mobile UI in the app.
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
      },
      testMatch: '**/mobile/**/*.spec.js',
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
