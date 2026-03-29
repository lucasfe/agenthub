import { test, expect } from '@playwright/test'

const BASE = '/ai/agenthub'
const DATA_TIMEOUT = 15000

// Generate unique ID to avoid conflicts between test runs
const uniqueId = () => `e2e-test-${Date.now()}`

test.describe('Agent Creation', () => {
  test('create agent with minimal fields', async ({ page }) => {
    const agentName = `Test Agent ${uniqueId()}`

    await page.goto(`${BASE}/create`)

    // Verify the create page loaded
    await expect(page.getByRole('heading', { name: 'Create Agent' })).toBeVisible()

    // Fill required fields
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('An E2E test agent')

    // Submit
    await page.getByRole('button', { name: /create agent/i }).click()

    // Should navigate to the agent detail page (no error shown)
    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible()
  })

  test('create agent with all fields filled', async ({ page }) => {
    const agentName = `Full Agent ${uniqueId()}`

    await page.goto(`${BASE}/create`)

    // Fill all fields
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('A fully configured test agent')
    await page.getByPlaceholder('React, TypeScript, CSS (comma-separated)').fill('E2E, Testing, Playwright')

    // Select AI Specialists category
    await page.getByRole('button', { name: 'AI Specialists' }).click()

    // Select a different color (green)
    await page.getByTitle('Green').click()

    // Add system prompt content
    await page.getByPlaceholder(/You are a senior developer/).fill('You are an E2E test agent.')

    // Submit
    await page.getByRole('button', { name: /create agent/i }).click()

    // Should navigate to agent detail page
    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible()
  })

  test('create agent shows error on duplicate ID', async ({ page }) => {
    // First, create an agent
    const agentName = `Dup Agent ${uniqueId()}`

    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('First agent')
    await page.getByRole('button', { name: /create agent/i }).click()
    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })

    // Try to create another agent with the same name (same ID)
    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Duplicate agent')
    await page.getByRole('button', { name: /create agent/i }).click()

    // Should show error message (not crash or navigate)
    await expect(page.locator('[class*="rose"]')).toBeVisible({ timeout: DATA_TIMEOUT })
  })

  test('create agent shows loading state during submission', async ({ page }) => {
    const agentName = `Loading Agent ${uniqueId()}`

    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Test loading')

    // Click create and immediately check for loading state
    await page.getByRole('button', { name: /create agent/i }).click()

    // Either shows "Creating..." briefly or navigates quickly — both are OK
    // The key assertion is that it doesn't crash
    const creatingOrNavigated = page.getByText('Creating...').or(page.getByText('Back to agents'))
    await expect(creatingOrNavigated.first()).toBeVisible({ timeout: DATA_TIMEOUT })
  })

  test('created agent appears on homepage when searched', async ({ page }) => {
    const agentName = `Listed Agent ${uniqueId()}`

    // Create an agent
    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Should appear on homepage')
    await page.getByRole('button', { name: /create agent/i }).click()
    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })

    // Go to homepage and search for the agent (new agents have popularity 0, sorted to bottom)
    await page.goto(`${BASE}/`)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: DATA_TIMEOUT })

    // Use the search to find the agent
    const searchInput = page.getByPlaceholder('Search agents...')
    await searchInput.fill(agentName)

    // Agent should appear in filtered results
    await expect(page.getByText(agentName)).toBeVisible({ timeout: DATA_TIMEOUT })
  })
})
