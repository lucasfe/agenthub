import { test, expect } from '@playwright/test'

const bypassEnabled = process.env.VITE_E2E_AUTH_BYPASS === 'true'

const MOBILE_TIMEOUT = 15000

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
}

function sse(events) {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
}

test.describe('Mobile chat', () => {
  test.beforeEach(async () => {
    test.skip(
      !bypassEnabled,
      'requires VITE_E2E_AUTH_BYPASS=true at build time so the chat route is reachable',
    )
  })

  test('typing, sending, and seeing a streamed response', async ({ page }) => {
    await page.route('**/functions/v1/chat', async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: sse([
          { type: 'chat.text', value: 'Hello ' },
          { type: 'chat.text', value: 'mobile' },
          { type: 'chat.done' },
        ]),
      })
    })

    await page.goto('/mobile/chat')
    const input = page.getByLabel('Message')
    await expect(input).toBeVisible({ timeout: MOBILE_TIMEOUT })

    await input.fill('Hi from e2e')
    await page.getByRole('button', { name: 'Send message' }).click()

    await expect(page.getByText('Hi from e2e')).toBeVisible()
    await expect(page.getByText('Hello mobile')).toBeVisible({
      timeout: MOBILE_TIMEOUT,
    })
  })

  test('agent picker bottom sheet opens, lists Auto, and closes after select', async ({
    page,
  }) => {
    await page.goto('/mobile/chat')
    await expect(page.getByLabel('Message')).toBeVisible({ timeout: MOBILE_TIMEOUT })

    await page.getByRole('button', { name: 'Select agent' }).click()
    const sheet = page.getByRole('dialog', { name: 'Pick an agent' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: /^Auto/ }).click()
    await expect(sheet).toBeHidden()
  })

  test('tool approval card renders and Approve flips to Approved', async ({ page }) => {
    await page.route('**/functions/v1/chat', async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: sse([
          {
            type: 'chat.tool_call',
            name: 'create_github_issue',
            input: { repo: 'lucasfe/agenthub', title: 'E2E', body: 'Body' },
            tool_call_id: 'call-e2e-1',
            requires_approval: true,
          },
          { type: 'chat.done' },
        ]),
      })
    })

    await page.goto('/mobile/chat')
    await page.getByLabel('Message').fill('File an issue')
    await page.getByRole('button', { name: 'Send message' }).click()

    const approveBtn = page.getByRole('button', { name: 'Approve', exact: true })
    await expect(approveBtn).toBeVisible({ timeout: MOBILE_TIMEOUT })
    await approveBtn.click()
    await expect(
      page.getByRole('button', { name: 'Approved', exact: true }),
    ).toBeVisible()
  })
})
