import { test, expect } from '@playwright/test'

const bypassEnabled = process.env.VITE_E2E_AUTH_BYPASS === 'true'

const MOBILE_TIMEOUT = 15000

test.describe('Mobile voice input', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !bypassEnabled,
      'requires VITE_E2E_AUTH_BYPASS=true at build time so the chat route is reachable',
    )
    // Stub the Web Speech API before any page script runs. The real API
    // requires a real microphone permission and a live microphone, neither
    // of which Playwright/Chromium can fake reliably; the contract we need to
    // exercise is the wiring inside MobileChat (lib/voice.js → setInput),
    // which is fully captured by emitting onresult+onend synchronously.
    await page.addInitScript(() => {
      class FakeSpeechRecognition {
        constructor() {
          this.continuous = false
          this.interimResults = false
          this.lang = ''
          this.onresult = null
          this.onerror = null
          this.onend = null
        }
        start() {
          setTimeout(() => {
            const transcripts = [{ transcript: 'hello from voice' }]
            transcripts.isFinal = true
            const event = { results: [transcripts] }
            try {
              this.onresult && this.onresult(event)
            } catch {
              // swallow — listener errors are not part of this contract
            }
            try {
              this.onend && this.onend()
            } catch {
              // swallow
            }
          }, 50)
        }
        stop() {
          try {
            this.onend && this.onend()
          } catch {
            // swallow
          }
        }
      }
      window.SpeechRecognition = FakeSpeechRecognition
      window.webkitSpeechRecognition = FakeSpeechRecognition
    })
  })

  test('tap mic, fire mock result, see transcript in input, send dispatches', async ({
    page,
  }) => {
    let postCount = 0
    await page.route('**/functions/v1/chat', async (route) => {
      postCount += 1
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body:
          'data: {"type":"chat.text","value":"ack"}\n\n' +
          'data: {"type":"chat.done"}\n\n',
      })
    })

    await page.goto('/mobile/chat')
    const input = page.getByLabel('Message')
    await expect(input).toBeVisible({ timeout: MOBILE_TIMEOUT })

    await page.getByRole('button', { name: 'Voice input' }).click()
    await expect(input).toHaveValue(/hello from voice/i, { timeout: 5000 })

    await page.getByRole('button', { name: 'Send message' }).click()
    await expect
      .poll(() => postCount, { timeout: MOBILE_TIMEOUT })
      .toBeGreaterThan(0)
  })
})
