import { test, expect } from '@playwright/test'

test.describe('Smoke Tests', () => {
  test('homepage loads with heading and agent cards', async ({ page }) => {
    await page.goto('/')

    // Verify the main heading is visible
    await expect(page.locator('h1').first()).toBeVisible()

    // Verify at least one agent card is rendered (links to agent detail pages)
    const agentCards = page.locator('a[href*="/agent/"]')
    await expect(agentCards.first()).toBeVisible()
    expect(await agentCards.count()).toBeGreaterThan(0)
  })

  test('agent detail page loads with prompt content', async ({ page }) => {
    await page.goto('/agent/development-team/frontend-developer')

    // Verify the agent name heading is visible
    await expect(page.locator('h1', { hasText: 'Frontend Developer' })).toBeVisible()

    // Verify prompt/content section is rendered (the markdown content area)
    const contentArea = page.locator('main')
    await expect(contentArea).toBeVisible()

    // Verify there is substantial text content (the system prompt)
    const textContent = await contentArea.textContent()
    expect(textContent.length).toBeGreaterThan(100)
  })

  test('teams page loads with team cards', async ({ page }) => {
    await page.goto('/teams')

    // Verify the Teams heading is visible
    await expect(page.locator('h1', { hasText: 'Teams' })).toBeVisible()

    // Verify at least one team card is rendered (links to team detail pages)
    const teamCards = page.locator('a[href*="/teams/"]')
    await expect(teamCards.first()).toBeVisible()
    expect(await teamCards.count()).toBeGreaterThan(0)
  })
})
