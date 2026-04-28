import { test, expect } from '@playwright/test'
import { cleanupByPrefix } from './helpers.js'

const BASE = ''
const DATA_TIMEOUT = 15000

// Single run ID shared across all tests in this file.
// Names start with "E2E" so the derived IDs always start with "e2e-",
// allowing a single LIKE pattern to clean everything this suite creates.
const RUN_ID = Date.now().toString()
let testCounter = 0
const uniqueId = () => `${RUN_ID}-${++testCounter}`

// Run tests serially — they share cleanup state
test.describe.configure({ mode: 'serial' })

// Purge any agents from prior runs that leaked (e.g. CI timeout before afterAll),
// then purge again after — so the next run always starts clean.
test.beforeAll(async () => {
  await cleanupByPrefix('agents', 'e2e-%')
})

test.afterAll(async () => {
  await cleanupByPrefix('agents', 'e2e-%')
})

test.describe('Agent Creation', () => {
  test('create agent with minimal fields', async ({ page }) => {
    const agentName = `E2E Test Agent ${uniqueId()}`

    await page.goto(`${BASE}/create`)
    await expect(page.getByRole('heading', { name: 'Create Agent' })).toBeVisible()

    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('An E2E test agent')
    await page.getByRole('button', { name: /create agent/i }).click()

    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible()
  })

  test('create agent with all fields filled', async ({ page }) => {
    const agentName = `E2E Full Agent ${uniqueId()}`

    await page.goto(`${BASE}/create`)

    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('A fully configured test agent')
    await page.getByPlaceholder('React, TypeScript, CSS (comma-separated)').fill('E2E, Testing, Playwright')
    await page.getByRole('button', { name: 'AI Specialists' }).click()
    await page.getByTitle('Green').click()
    await page.getByPlaceholder(/You are a senior developer/).fill('You are an E2E test agent.')

    await page.getByRole('button', { name: /create agent/i }).click()

    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible()
  })

  test('create agent shows error on duplicate ID', async ({ page }) => {
    const agentName = `E2E Dup Agent ${uniqueId()}`

    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('First agent')
    await page.getByRole('button', { name: /create agent/i }).click()
    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })

    // Try duplicate
    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Duplicate agent')
    await page.getByRole('button', { name: /create agent/i }).click()

    await expect(page.locator('[class*="rose"]')).toBeVisible({ timeout: DATA_TIMEOUT })
  })

  test('create agent shows loading state during submission', async ({ page }) => {
    const agentName = `E2E Loading Agent ${uniqueId()}`

    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Test loading')
    await page.getByRole('button', { name: /create agent/i }).click()

    const creatingOrNavigated = page.getByText('Creating...').or(page.getByText('Back to agents'))
    await expect(creatingOrNavigated.first()).toBeVisible({ timeout: DATA_TIMEOUT })
  })

  test('delete agent via confirmation modal', async ({ page }) => {
    const agentName = `E2E Delete Agent ${uniqueId()}`

    // Create the agent first
    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Agent to be deleted')
    await page.getByRole('button', { name: /create agent/i }).click()
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible({ timeout: DATA_TIMEOUT })

    // Click the delete button
    await page.getByRole('button', { name: /delete/i }).click()

    // Modal should appear with confirmation input
    await expect(page.getByText('This action cannot be undone.')).toBeVisible()

    // Delete button should be disabled before typing the name
    const deleteBtn = page.getByRole('button', { name: /delete agent/i })
    await expect(deleteBtn).toBeDisabled()

    // Type the agent name to confirm
    await page.getByPlaceholder(agentName).fill(agentName)
    await expect(deleteBtn).toBeEnabled()

    // Confirm deletion
    await deleteBtn.click()

    // Should redirect to home
    await expect(page).toHaveURL(new RegExp(`${BASE}/?$`), { timeout: DATA_TIMEOUT })
  })

  test('delete modal closes on cancel', async ({ page }) => {
    await page.goto(`${BASE}/agent/development-team/frontend-developer`)
    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })

    await page.getByRole('button', { name: /delete/i }).click()
    await expect(page.getByText('This action cannot be undone.')).toBeVisible()

    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByText('This action cannot be undone.')).not.toBeVisible()
  })

  test('delete modal closes on escape key', async ({ page }) => {
    await page.goto(`${BASE}/agent/development-team/frontend-developer`)
    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })

    await page.getByRole('button', { name: /delete/i }).click()
    await expect(page.getByText('This action cannot be undone.')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByText('This action cannot be undone.')).not.toBeVisible()
  })

  test('created agent is accessible via detail page', async ({ page }) => {
    const agentName = `E2E Detail Agent ${uniqueId()}`

    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Should be accessible')
    await page.getByRole('button', { name: /create agent/i }).click()

    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible({ timeout: DATA_TIMEOUT })
  })

  test('code tab shows editable textarea and save button', async ({ page }) => {
    await page.goto(`${BASE}/agent/development-team/frontend-developer`)
    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })

    // Click Description tab to see Code/Preview toggle
    await page.getByRole('button', { name: 'Description' }).click()

    // Switch to Code view
    await page.getByRole('button', { name: 'Code' }).click()

    // Should show a textarea
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()

    // Save button should exist but be disabled (no changes yet)
    const saveBtn = page.getByRole('button', { name: /save/i })
    await expect(saveBtn).toBeVisible()
    await expect(saveBtn).toBeDisabled()
  })

  test('editing content enables save and persists on save', async ({ page }) => {
    const agentName = `E2E Edit Agent ${uniqueId()}`

    // Create agent with initial content
    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Agent for edit test')
    await page.getByPlaceholder(/You are a senior developer/).fill('## Initial Content')
    await page.getByRole('button', { name: /create agent/i }).click()
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible({ timeout: DATA_TIMEOUT })

    // Switch to Code view
    await page.getByRole('button', { name: 'Code' }).click()

    // Edit content in the textarea
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()
    await textarea.fill('## Updated Content\n\nNew paragraph here.')

    // Unsaved changes indicator should appear
    await expect(page.getByText('Unsaved changes')).toBeVisible()

    // Save should be enabled now
    const saveBtn = page.getByRole('button', { name: /^save$/i })
    await expect(saveBtn).toBeEnabled()

    // Intercept PATCH to verify save reaches the server
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/rest/v1/agents') && resp.request().method() === 'PATCH'),
      saveBtn.click(),
    ])
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.content).toContain('Updated Content')

    // Should show saved confirmation
    await expect(page.getByText('Saved')).toBeVisible({ timeout: DATA_TIMEOUT })

    // Switch to Preview — should render the updated markdown
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByText('Updated Content')).toBeVisible({ timeout: DATA_TIMEOUT })
  })

  test('preview tab renders markdown properly', async ({ page }) => {
    const agentName = `E2E Preview Agent ${uniqueId()}`

    // Create agent with markdown content
    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Agent for preview test')
    await page.getByPlaceholder(/You are a senior developer/).fill('## My Heading\n\nSome paragraph text.\n\n- List item one\n- List item two')
    await page.getByRole('button', { name: /create agent/i }).click()
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible({ timeout: DATA_TIMEOUT })

    // Preview should render markdown
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByRole('heading', { name: 'My Heading' })).toBeVisible()
    await expect(page.getByText('Some paragraph text.')).toBeVisible()
  })
})
