import { test, expect } from '@playwright/test'

const bypassEnabled = process.env.VITE_E2E_AUTH_BYPASS === 'true'

const MOBILE_TIMEOUT = 15000

test.describe('Mobile push opt-in card', () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassEnabled,
      'requires VITE_E2E_AUTH_BYPASS=true at build time so the chat route is reachable',
    )
  })

  test('visible on first visit, dismissible, persists across reload', async ({ page }) => {
    await page.goto('/mobile/chat')
    const card = page.getByRole('region', { name: 'Enable notifications' })
    await expect(card).toBeVisible({ timeout: MOBILE_TIMEOUT })

    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(card).toBeHidden()

    // localStorage was written; reloading should keep the card hidden.
    await page.reload()
    await expect(card).toBeHidden()
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible({
      timeout: MOBILE_TIMEOUT,
    })
  })
})
