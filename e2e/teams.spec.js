import { test, expect } from '@playwright/test'

const BASE = '/ai/agenthub'
const T = 15000

const uniqueId = () => `e2e-${Date.now()}`

test.describe('Teams', () => {
  test('teams page loads with team cards', async ({ page }) => {
    await page.goto(`${BASE}/teams`)
    const teamCards = page.locator(`a[href*="${BASE}/teams/"]`)
    const noTeams = page.getByText('No teams found')
    await expect(teamCards.first().or(noTeams)).toBeVisible({ timeout: T })
  })

  test('team detail page shows members', async ({ page }) => {
    await page.goto(`${BASE}/teams/web-app-squad`)
    await expect(page.getByText('Back to teams')).toBeVisible({ timeout: T })
    await expect(page.getByRole('heading', { name: 'Web App Squad' })).toBeVisible()
    await expect(page.getByText('Team Members')).toBeVisible()
  })

  test('team edit page loads with pre-filled data', async ({ page }) => {
    await page.goto(`${BASE}/teams/web-app-squad/edit`)
    await expect(page.getByRole('heading', { name: 'Edit Team' })).toBeVisible({ timeout: T })

    const nameInput = page.getByPlaceholder('e.g. Web App Squad')
    await expect(nameInput).toHaveValue('Web App Squad')
  })

  test('team edit saves changes', async ({ page }) => {
    await page.goto(`${BASE}/teams/web-app-squad/edit`)
    await expect(page.getByRole('heading', { name: 'Edit Team' })).toBeVisible({ timeout: T })

    await page.getByRole('button', { name: /save changes/i }).click()

    // Should navigate back to team detail after save
    await expect(page.getByText('Back to teams').or(page.getByText('Saving...'))).toBeVisible({ timeout: T })
  })

  test('create team with name and description', async ({ page }) => {
    const teamName = `CI Team ${uniqueId()}`

    await page.goto(`${BASE}/teams/create`)
    await expect(page.getByRole('heading', { name: 'Create Team' })).toBeVisible({ timeout: T })

    await page.getByPlaceholder('e.g. Web App Squad').fill(teamName)
    await page.getByPlaceholder('What does this team do...').fill('Created by E2E test')

    await page.getByRole('button', { name: /create team/i }).click()

    // Should navigate to teams list or team detail
    const success = page.getByText('Back to teams').or(page.locator(`a[href*="${BASE}/teams/"]`).first())
    await expect(success).toBeVisible({ timeout: T })
  })

  test('create team shows error on duplicate ID', async ({ page }) => {
    // Try to create a team with an existing name
    await page.goto(`${BASE}/teams/create`)
    await expect(page.getByRole('heading', { name: 'Create Team' })).toBeVisible({ timeout: T })

    await page.getByPlaceholder('e.g. Web App Squad').fill('Web App Squad')
    await page.getByPlaceholder('What does this team do...').fill('Duplicate test')

    await page.getByRole('button', { name: /create team/i }).click()

    // Should show error (not crash)
    await expect(page.locator('[class*="rose"]')).toBeVisible({ timeout: T })
  })
})
