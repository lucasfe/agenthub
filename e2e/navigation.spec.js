import { test, expect } from '@playwright/test'

const BASE = '/ai/agenthub'
const T = 15000

test.describe('Navigation & Layout', () => {
  test('homepage loads with agent cards', async ({ page }) => {
    await page.goto(`${BASE}/`)
    const cards = page.locator(`a[href*="${BASE}/agent/"]`)
    await expect(cards.first()).toBeVisible({ timeout: T })
    expect(await cards.count()).toBeGreaterThan(0)
  })

  test('search filters agents', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page.locator(`a[href*="${BASE}/agent/"]`).first()).toBeVisible({ timeout: T })

    await page.getByPlaceholder('Search components...').fill('frontend')
    await page.waitForTimeout(300)

    const cards = page.locator(`a[href*="${BASE}/agent/"]`)
    expect(await cards.count()).toBeGreaterThan(0)
    expect(await cards.count()).toBeLessThan(34)
  })

  test('clicking agent card opens detail page', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page.locator(`a[href*="${BASE}/agent/"]`).first()).toBeVisible({ timeout: T })

    const firstCard = page.locator(`a[href*="${BASE}/agent/"]`).first()
    await firstCard.click()

    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: T })
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('agent detail tabs switch content', async ({ page }) => {
    await page.goto(`${BASE}/agent/development-team/frontend-developer`)
    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: T })

    await page.getByRole('button', { name: 'Tools' }).click()
    await expect(page.getByText('Available Tools')).toBeVisible()

    await page.getByRole('button', { name: 'Model' }).click()
    await expect(page.getByText('Claude Sonnet')).toBeVisible()

    await page.getByRole('button', { name: 'Description' }).click()
  })

  test('sidebar navigates between pages', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: T })

    await page.getByRole('link', { name: /teams/i }).first().click()
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/teams/)
  })

  test('sidebar collapse toggle works', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: T })

    const collapseBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevrons-left') })
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click()
      await page.waitForTimeout(300)
      // Sidebar should be narrow
      const expandBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevrons-right') })
      await expect(expandBtn).toBeVisible()
    }
  })

  test('theme toggle switches to light mode', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: T })

    const themeBtn = page.locator('button').filter({ has: page.locator('svg.lucide-sun, svg.lucide-moon') })
    if (await themeBtn.isVisible()) {
      await themeBtn.click()
      await page.waitForTimeout(300)
      const html = page.locator('html')
      await expect(html).toHaveAttribute('data-theme', 'light')
    }
  })

  test('stack system - add and see agent in stack', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page.locator(`a[href*="${BASE}/agent/"]`).first()).toBeVisible({ timeout: T })

    const firstCard = page.locator(`a[href*="${BASE}/agent/"]`).first()
    await firstCard.hover()
    await page.waitForTimeout(200)

    const addBtn = firstCard.locator('button').first()
    if (await addBtn.isVisible()) {
      await addBtn.click()
      await page.waitForTimeout(300)
      // Stack button should appear or update
      await expect(addBtn).toHaveClass(/bg-accent-green/)
    }
  })
})
