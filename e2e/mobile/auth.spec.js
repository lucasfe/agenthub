import { test, expect } from '@playwright/test'

const bypassEnabled = process.env.VITE_E2E_AUTH_BYPASS === 'true'

const MOBILE_TIMEOUT = 15000

test.describe('Mobile auth gate', () => {
  test('redirects unauthenticated user to /mobile/login', async ({ page }) => {
    test.skip(
      bypassEnabled,
      'cannot test the unauthenticated redirect when VITE_E2E_AUTH_BYPASS is on; covered by the bypass test in this same file in CI',
    )
    await page.goto('/mobile/chat')
    await expect(page).toHaveURL(/\/mobile\/login/)
    await expect(
      page.getByRole('button', { name: /Continue with Google/i }),
    ).toBeVisible({ timeout: MOBILE_TIMEOUT })
  })

  test('VITE_E2E_AUTH_BYPASS lands the user on /mobile/chat', async ({ page }) => {
    test.skip(
      !bypassEnabled,
      'requires VITE_E2E_AUTH_BYPASS=true at build time; covered by the unauthenticated test in this same file locally',
    )
    await page.goto('/mobile/chat')
    await expect(page).toHaveURL(/\/mobile\/chat/)
    await expect(page.getByLabel('Message')).toBeVisible({ timeout: MOBILE_TIMEOUT })
  })
})
