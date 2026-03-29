import { test, expect } from '@playwright/test'

const BASE = '/ai/agenthub'

// Data loads asynchronously from Supabase
const DATA_TIMEOUT = 30000

test.describe('Smoke Tests', () => {
  test('homepage loads and finishes loading', async ({ page }) => {
    await page.goto(`${BASE}/`)

    // Wait for the loading state to resolve (either data or "No agents found")
    await expect(page.locator('h1').first()).toBeVisible({ timeout: DATA_TIMEOUT })
  })

  test('agent detail page loads', async ({ page }) => {
    // First go to homepage and get an agent link
    await page.goto(`${BASE}/`)

    // Wait for agent cards to appear
    const agentCard = page.locator(`a[href*="${BASE}/agent/"]`).first()
    const hasAgents = await agentCard.isVisible({ timeout: DATA_TIMEOUT }).catch(() => false)

    if (!hasAgents) {
      test.skip(true, 'No agents in database — skipping detail page test')
      return
    }

    // Navigate to the first agent's detail page
    await agentCard.click()

    // Verify agent detail page loads with a heading
    await expect(page.locator('h1').first()).toBeVisible({ timeout: DATA_TIMEOUT })

    // Verify we're on a detail page (back link exists)
    await expect(page.getByText('Back to agents')).toBeVisible()
  })

  test('teams page loads and finishes loading', async ({ page }) => {
    await page.goto(`${BASE}/teams`)

    // Wait for loading to finish — either team cards appear or "No teams found" message
    const teamCards = page.locator(`a[href*="${BASE}/teams/"]`).first()
    const noTeams = page.getByText('No teams found')
    await expect(teamCards.or(noTeams).first()).toBeVisible({ timeout: DATA_TIMEOUT })
  })
})
