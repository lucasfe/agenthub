import { test, expect } from '@playwright/test'

const BASE = '/ai/agenthub'

// Data loads asynchronously from Supabase, so we need longer timeouts in CI
const DATA_TIMEOUT = 30000

test.describe('Smoke Tests', () => {
  test('homepage loads with heading and agent cards', async ({ page }) => {
    await page.goto(`${BASE}/`)

    // Wait for data to load and agent cards to appear
    const agentCards = page.locator(`a[href*="${BASE}/agent/"]`)
    await expect(agentCards.first()).toBeVisible({ timeout: DATA_TIMEOUT })

    // Verify the main heading is visible
    await expect(page.locator('h1').first()).toBeVisible()

    expect(await agentCards.count()).toBeGreaterThan(0)
  })

  test('agent detail page loads with prompt content', async ({ page }) => {
    await page.goto(`${BASE}/agent/development-team/frontend-developer`)

    // Wait for agent data to load from Supabase
    await expect(page.locator('h1', { hasText: 'Frontend Developer' })).toBeVisible({ timeout: DATA_TIMEOUT })

    // Verify the content tab shows text (system prompt from DB)
    await expect(page.getByText('Content')).toBeVisible({ timeout: DATA_TIMEOUT })
  })

  test('teams page loads with team cards', async ({ page }) => {
    await page.goto(`${BASE}/teams`)

    // Wait for data to load and team cards to appear
    const teamCards = page.locator(`a[href*="${BASE}/teams/"]`)
    await expect(teamCards.first()).toBeVisible({ timeout: DATA_TIMEOUT })

    expect(await teamCards.count()).toBeGreaterThan(0)
  })
})
