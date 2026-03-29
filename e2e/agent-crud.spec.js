import { test, expect } from '@playwright/test'
import { cleanupTestData } from './helpers.js'

const BASE = '/ai/agenthub'
const DATA_TIMEOUT = 15000

// Single run ID shared across all tests in this file
const RUN_ID = `e2e-${Date.now()}`
let testCounter = 0
const uniqueId = () => `${RUN_ID}-${++testCounter}`

// Run tests serially — they share cleanup state
test.describe.configure({ mode: 'serial' })

// Track created agent IDs for cleanup
const createdAgentIds = []

// Clean up after all tests complete
test.afterAll(async () => {
  for (const id of createdAgentIds) {
    await cleanupTestData('agents', id)
  }
})

test.describe('Agent Creation', () => {
  test('create agent with minimal fields', async ({ page }) => {
    const agentName = `Test Agent ${uniqueId()}`
    const agentId = agentName.toLowerCase().replace(/\s+/g, '-')
    createdAgentIds.push(agentId)

    await page.goto(`${BASE}/create`)
    await expect(page.getByRole('heading', { name: 'Create Agent' })).toBeVisible()

    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('An E2E test agent')
    await page.getByRole('button', { name: /create agent/i }).click()

    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible()
  })

  test('create agent with all fields filled', async ({ page }) => {
    const agentName = `Full Agent ${uniqueId()}`
    const agentId = agentName.toLowerCase().replace(/\s+/g, '-')
    createdAgentIds.push(agentId)

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
    const agentName = `Dup Agent ${uniqueId()}`
    const agentId = agentName.toLowerCase().replace(/\s+/g, '-')
    createdAgentIds.push(agentId)

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
    const agentName = `Loading Agent ${uniqueId()}`
    const agentId = agentName.toLowerCase().replace(/\s+/g, '-')
    createdAgentIds.push(agentId)

    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Test loading')
    await page.getByRole('button', { name: /create agent/i }).click()

    const creatingOrNavigated = page.getByText('Creating...').or(page.getByText('Back to agents'))
    await expect(creatingOrNavigated.first()).toBeVisible({ timeout: DATA_TIMEOUT })
  })

  test('created agent is accessible via detail page', async ({ page }) => {
    const agentName = `Detail Agent ${uniqueId()}`
    const agentId = agentName.toLowerCase().replace(/\s+/g, '-')
    createdAgentIds.push(agentId)

    await page.goto(`${BASE}/create`)
    await page.getByPlaceholder('e.g. Frontend Developer').fill(agentName)
    await page.getByPlaceholder('A short summary of what this agent does...').fill('Should be accessible')
    await page.getByRole('button', { name: /create agent/i }).click()

    await expect(page.getByText('Back to agents')).toBeVisible({ timeout: DATA_TIMEOUT })
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible({ timeout: DATA_TIMEOUT })
  })
})
